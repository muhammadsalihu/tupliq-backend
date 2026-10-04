import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { CronParserService } from './cron-parser.service';
import { PushService } from '../push/push.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

const AGENT37_API = 'https://api.agent37.com';

/** A connectable tool offered by Agent37 (Gmail, Slack, GitHub, …). */
export interface ToolkitDto {
  toolkit: string;
  label?: string;
  description?: string;
  icon?: string;
}

/** An OAuth link a user has already completed. */
export interface ConnectionDto {
  toolkit: string;
  account?: string | null;
  status?: string;
}
const MAX_CRONS = 50;

interface Agent37Instance {
  id: string;
  status: string;
  template: string;
  url: string;
  resources: { cpu: number; memory: number; disk: number };
  name: string | null;
  metadata: Record<string, unknown> | null;
  created: number;
}

interface Agent37Response {
  id: string;
  session_id?: string;
  output_text?: string;
  usage?: { input_tokens: number; output_tokens: number; cost_usd: number };
}

@Injectable()
export class CloudAgentService {
  private readonly logger = new Logger(CloudAgentService.name);
  private readonly apiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cronParser: CronParserService,
    private readonly push: PushService,
  ) {
    this.apiKey = this.config.get<string>('AGENT37_API_KEY', '');
    if (!this.apiKey) {
      this.logger.warn('AGENT37_API_KEY is not set. Cloud agent features disabled.');
    }
  }

  // ── Instance lifecycle ──────────────────────────────────────────────

  async provision(userId: string, name?: string) {
    this.assertKey();

    // Check if user already has an instance
    const existing = await this.prisma.userInstance.findUnique({ where: { userId } });
    if (existing && existing.status !== 'deleted') {
      throw new BadRequestException('You already have a cloud agent. Delete it first to create a new one.');
    }

    const notifyToken = crypto.randomBytes(24).toString('hex');

    const body: Record<string, unknown> = {
      template: 'agent37-hermes',
      resources: { cpu: 2, memory: 4, disk: 4 },
      metadata: { user_id: userId },
      env: {
        GROKBOT_NOTIFY_TOKEN: notifyToken,
        TUPLIQ_API_URL: 'https://api.airbills.digital',
      },
    };
    if (name) body.name = name;

    const res = await this.request('POST', '/v1/instances', body);
    const instance = res as Agent37Instance;

    // Upsert in DB with notifyToken
    await this.prisma.userInstance.upsert({
      where: { userId },
      create: {
        userId,
        instanceId: instance.id,
        instanceUrl: instance.url,
        status: instance.status,
        template: instance.template,
        notifyToken,
      },
      update: {
        instanceId: instance.id,
        instanceUrl: instance.url,
        status: instance.status,
        template: instance.template,
        notifyToken,
      },
    });

    // Write Grok Bot files to instance (non-fatal)
    try {
      await this.putFileRaw(instance.url, '~/.hermes/SOUL.md', this.getSoulMd());
      await this.putFileRaw(instance.url, '~/.grokbot/notify.mjs', this.getNotifyMjs());
    } catch (err) {
      this.logger.warn(`Could not write Grok Bot files to instance ${instance.id}: ${err}`);
    }

    this.logger.log(`Provisioned instance ${instance.id} for user ${userId}`);
    return {
      instanceId: instance.id,
      url: instance.url,
      status: instance.status,
    };
  }

  async getStatus(userId: string) {
    const record = await this.prisma.userInstance.findUnique({ where: { userId } });
    if (!record || record.status === 'deleted') {
      return { provisioned: false };
    }

    // Optionally refresh status from Agent37
    try {
      const res = await this.request('GET', `/v1/instances/${record.instanceId}`);
      const instance = res as Agent37Instance;
      if (instance.status !== record.status) {
        await this.prisma.userInstance.update({
          where: { userId },
          data: { status: instance.status },
        });
        record.status = instance.status;
      }
    } catch {
      // If instance was deleted externally, mark it
      this.logger.warn(`Could not reach instance ${record.instanceId}`);
    }

    return {
      provisioned: true,
      instanceId: record.instanceId,
      url: record.instanceUrl,
      status: record.status,
      template: record.template,
      createdAt: record.createdAt,
    };
  }

  async deprovision(userId: string) {
    this.assertKey();

    const record = await this.prisma.userInstance.findUnique({ where: { userId } });
    if (!record || record.status === 'deleted') {
      throw new NotFoundException('No cloud agent to delete.');
    }

    try {
      await this.request('DELETE', `/v1/instances/${record.instanceId}`);
    } catch (err) {
      this.logger.warn(`Agent37 delete failed for ${record.instanceId}: ${err}`);
    }

    await this.prisma.userInstance.update({
      where: { userId },
      data: { status: 'deleted' },
    });

    this.logger.log(`Deprovisioned instance ${record.instanceId} for user ${userId}`);
    return { ok: true };
  }

  // ── Chat ────────────────────────────────────────────────────────────

  async sendMessage(userId: string, input: string, sessionId?: string) {
    this.assertKey();

    const record = await this.prisma.userInstance.findUnique({ where: { userId } });
    if (!record || record.status === 'deleted') {
      throw new NotFoundException('No cloud agent. Provision one first.');
    }

    const body: Record<string, unknown> = { input };
    if (sessionId) body.session_id = sessionId;

    const res = await this.request(
      'POST',
      `/v1/responses`,
      body,
      record.instanceUrl,
    );

    const data = res as Agent37Response;
    return {
      output: data.output_text ?? '',
      sessionId: data.session_id ?? sessionId ?? null,
      usage: data.usage ?? null,
    };
  }

  async sendMessageStream(
    userId: string,
    input: string,
    sessionId: string | undefined,
    onEvent: (event: string, data: unknown) => void,
  ) {
    this.assertKey();

    const record = await this.prisma.userInstance.findUnique({ where: { userId } });
    if (!record || record.status === 'deleted') {
      throw new NotFoundException('No cloud agent. Provision one first.');
    }

    const body: Record<string, unknown> = { input, stream: true };
    if (sessionId) body.session_id = sessionId;

    const url = `${record.instanceUrl}/v1/responses`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Agent37-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`Agent37 error ${res.status}: ${text}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new BadRequestException('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let finalSessionId = sessionId;
    let eventType: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ') && eventType) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.session_id) finalSessionId = parsed.session_id;
            onEvent(eventType, parsed);
          } catch { /* skip malformed */ }
          eventType = undefined;
        }
      }
    }

    return { sessionId: finalSessionId };
  }

  // ── HTTP helper ─────────────────────────────────────────────────────

  async getAccessUrls(userId: string) {
    this.assertKey();
    const record = await this.prisma.userInstance.findUnique({ where: { userId } });
    if (!record || record.status === 'deleted') throw new NotFoundException('No cloud agent.');
    const ports = [{ key: 'dashboard', port: 9119 }, { key: 'terminal', port: 7681 }, { key: 'files', port: 8080 }];
    const urls: Record<string, string> = {};
    for (const { key, port } of ports) {
      try {
        const res = await this.request('POST', `/v1/instances/${record.instanceId}/signed-url`, { port });
        urls[key] = (res as { url: string }).url;
      } catch { /* skip */ }
    }
    return urls;
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    baseUrl?: string,
  ): Promise<unknown> {
    const url = `${baseUrl ?? AGENT37_API}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    // Agent instance URLs use X-Agent37-Key instead
    if (baseUrl) {
      delete headers.Authorization;
      headers['X-Agent37-Key'] = this.apiKey;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Agent37 ${method} ${path} failed: ${res.status} ${text}`);
      throw new BadRequestException(`Agent37 API error: ${res.status}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  private assertKey() {
    if (!this.apiKey) {
      throw new BadRequestException('Cloud agent is not configured.');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // File helpers (public — used by BotsService)
  // ═══════════════════════════════════════════════════════════

  async putFileRaw(instanceUrl: string, path: string, content: string) {
    const url = `${instanceUrl}/v1/files/content?path=${encodeURIComponent(path)}&overwrite=true`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'X-Agent37-Key': this.apiKey, 'Content-Type': 'text/plain' },
      body: content,
    });
    if (!res.ok) throw new Error(`File PUT failed: ${res.status}`);
  }

  async putFile(instance: { instanceUrl: string }, path: string, content: string) {
    return this.putFileRaw(instance.instanceUrl, path, content);
  }

  async deleteFile(instance: { instanceUrl: string }, path: string) {
    const url = `${instance.instanceUrl}/v1/files/content?path=${encodeURIComponent(path)}`;
    await fetch(url, { method: 'DELETE', headers: { 'X-Agent37-Key': this.apiKey } });
  }

  async deleteBotCrons(userId: string, handle: string) {
    const instance = await this.prisma.userInstance.findUnique({ where: { userId } });
    if (!instance) return;
    const prefix = `${handle}:`;
    const crons = await this.request('GET', `/v1/instances/${instance.instanceId}/crons`) as any[];
    if (!Array.isArray(crons)) return;
    for (const c of crons) {
      if (c.name?.startsWith(prefix)) {
        try { await this.request('DELETE', `/v1/instances/${instance.instanceId}/crons/${encodeURIComponent(c.name)}`); } catch { /* skip */ }
      }
    }
  }

  async getInstanceOrThrow(userId: string) {
    const inst = await this.prisma.userInstance.findUnique({ where: { userId } });
    if (!inst || inst.status === 'deleted') throw new NotFoundException('No cloud agent.');
    return inst;
  }

  private getSoulMd(): string {
    return `# Team computer
You are the shared computer behind this user's team of Bots. Every conversation belongs
to one Bot: the app opens it with an "App context" block naming the Bot, its job and its
notes file. Stay in that Bot's role for the whole conversation.

- Each Bot keeps its own notes in ~/bots/<handle>/notes.md. Read them at the start of
  a conversation and update them as you work.
- You can follow up later. Schedule your own future turns with the agent37 CLI:
  agent37 cron add --name "<handle>: <short name>" --schedule "<5-field cron>"
    --timezone "Africa/Lagos" --prompt "<what to do, starting with which Bot you are>"
  Never say you cannot follow up.
- You can message the user proactively: node ~/.grokbot/notify.mjs <handle> "<summary>"
- Never buy anything or enter payment details. Hand purchases back to the user.`;
  }

  private getNotifyMjs(): string {
    return `const [bot, ...words] = process.argv.slice(2);
const text = words.join(" ");
const res = await fetch(\`\${process.env.TUPLIQ_API_URL}/cloud-agent/notify\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.GROKBOT_NOTIFY_TOKEN}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ instance_id: process.env.AGENT37_INSTANCE_ID, bot, text }),
});
console.log(res.status, await res.text());`;
  }

  // ═══════════════════════════════════════════════════════════
  // Bot chat
  // ═══════════════════════════════════════════════════════════

  private botBrief(bot: any): string {
    return `App context (from the Bots app, not the user):
You are ${bot.name}, the user's ${bot.title}. ${bot.description || ''}
Your notes are at ~/bots/${bot.handle}/notes.md - read them at the start of a turn and update them as you work.
End of app context. The user message follows.

`;
  }

  async sendBotMessage(userId: string, botId: string, input: string, sessionId?: string, model?: string) {
    this.assertKey();
    const instance = await this.getInstanceOrThrow(userId);
    const bot = await this.prisma.bot.findFirst({ where: { id: botId, userId } });
    if (!bot) throw new NotFoundException('Bot not found.');

    let sid = sessionId;
    if (!sid) {
      sid = crypto.randomBytes(16).toString('hex');
      const sessions = (bot.sessions as any[]) ?? [];
      sessions.push({ id: sid, label: `Chat ${new Date().toISOString()}` });
      await this.prisma.bot.update({ where: { id: bot.id }, data: { sessions } });
    }

    const fullInput = this.botBrief(bot) + input;
    const body: Record<string, unknown> = { input: fullInput, session_id: sid };
    if (model && model !== 'default') body.model = model;

    const res = await this.request('POST', '/v1/responses', body, instance.instanceUrl) as Agent37Response;
    return { output: res.output_text ?? '', sessionId: sid, usage: res.usage ?? null };
  }

  async sendBotMessageStream(
    userId: string, botId: string, input: string, sessionId: string | undefined,
    onEvent: (event: string, data: unknown) => void, model?: string,
  ) {
    this.assertKey();
    const instance = await this.getInstanceOrThrow(userId);
    const bot = await this.prisma.bot.findFirst({ where: { id: botId, userId } });
    if (!bot) throw new NotFoundException('Bot not found.');

    let sid = sessionId;
    if (!sid) {
      sid = crypto.randomBytes(16).toString('hex');
      const sessions = (bot.sessions as any[]) ?? [];
      sessions.push({ id: sid, label: `Chat ${new Date().toISOString()}` });
      await this.prisma.bot.update({ where: { id: bot.id }, data: { sessions } });
    }

    const fullInput = this.botBrief(bot) + input;
    const body: Record<string, unknown> = { input: fullInput, session_id: sid, stream: true };
    if (model && model !== 'default') body.model = model;

    return this.streamFromInstance(instance.instanceUrl, body, sid, onEvent);
  }

  // ═══════════════════════════════════════════════════════════
  // Team chat
  // ═══════════════════════════════════════════════════════════

  async handleTeamChat(userId: string, input: string, onEvent: (event: string, data: unknown) => void) {
    this.assertKey();
    const instance = await this.getInstanceOrThrow(userId);

    const mentionedHandles = [...input.matchAll(/@([a-z0-9-]+)/gi)].map(m => m[1].toLowerCase());
    if (mentionedHandles.length === 0) {
      onEvent('done', {});
      return;
    }

    const bots = await this.prisma.bot.findMany({
      where: { userId, handle: { in: mentionedHandles } },
    });

    let hopCount = 0;
    const processed = new Set<string>();

    const askBot = async (bot: any, text: string, from?: string) => {
      if (hopCount >= 2) return;
      hopCount++;
      processed.add(bot.handle);

      let gsid = bot.groupSessionId;
      if (!gsid) {
        gsid = crypto.randomBytes(16).toString('hex');
        await this.prisma.bot.update({ where: { id: bot.id }, data: { groupSessionId: gsid } });
      }

      const contextText = from ? `${from} says: ${text}` : text;
      const fullInput = this.botBrief(bot) + contextText;

      try {
        const body: Record<string, unknown> = { input: fullInput, session_id: gsid, stream: true };
        let accumulated = '';
        await this.streamFromInstance(instance.instanceUrl, body, gsid, (event, data) => {
          if (event === 'response.output_text.delta' && (data as any)?.text) {
            accumulated += (data as any).text;
          }
        });
        if (accumulated) {
          onEvent('team-message', { bot: bot.handle, text: accumulated });
          // Check for handoffs
          const handoffs = [...accumulated.matchAll(/@([a-z0-9-]+)/gi)].map(m => m[1].toLowerCase());
          for (const h of handoffs) {
            if (!processed.has(h) && h !== bot.handle) {
              onEvent('handoff', { from: bot.handle, to: h, text: accumulated });
              const targetBot = bots.find(b => b.handle === h) ??
                await this.prisma.bot.findFirst({ where: { userId, handle: h } });
              if (targetBot) await askBot(targetBot, accumulated, bot.name);
            }
          }
        }
      } catch (err: any) {
        onEvent('team-message', { bot: bot.handle, text: `Error: ${err.message}` });
      }
    };

    for (const bot of bots) {
      await askBot(bot, input);
    }

    onEvent('done', {});
  }

  // ═══════════════════════════════════════════════════════════
  // Routines
  // ═══════════════════════════════════════════════════════════

  async listRoutines(userId: string, botId: string) {
    this.assertKey();
    const bot = await this.prisma.bot.findFirst({ where: { id: botId, userId } });
    if (!bot) throw new NotFoundException('Bot not found.');
    const instance = await this.getInstanceOrThrow(userId);
    const crons = await this.request('GET', `/v1/instances/${instance.instanceId}/crons`) as any[];
    if (!Array.isArray(crons)) return [];
    return crons.filter((c: any) => c.name?.startsWith(`${bot.handle}:`));
  }

  async createRoutine(userId: string, botId: string, dto: { name: string; schedule: string; timezone: string; prompt: string }) {
    this.assertKey();
    const bot = await this.prisma.bot.findFirst({ where: { id: botId, userId } });
    if (!bot) throw new NotFoundException('Bot not found.');
    const instance = await this.getInstanceOrThrow(userId);

    const crons = await this.request('GET', `/v1/instances/${instance.instanceId}/crons`) as any[];
    if (Array.isArray(crons) && crons.length >= MAX_CRONS)
      throw new BadRequestException(`Maximum ${MAX_CRONS} routines per instance.`);

    // Accept plain English ("every weekday at 9am") or raw cron ("0 9 * * 1-5").
    // The parser is also the validator — clients cannot push arbitrary schedules.
    const parsed = this.cronParser.parse(dto.schedule);
    if (!parsed) {
      throw new BadRequestException(
        `Could not understand the schedule "${dto.schedule}". ` +
        'Try e.g. "every weekday at 9am", "daily at 14:30", "every 30 minutes", or a cron like "0 9 * * *".',
      );
    }

    const cronName = `${bot.handle}: ${dto.name}`;
    const fullPrompt = this.botBrief(bot) + `This is a scheduled routine. ${dto.prompt}`;
    return this.request('POST', `/v1/instances/${instance.instanceId}/crons`, {
      name: cronName, prompt: fullPrompt, schedule: parsed.schedule, timezone: dto.timezone, agent: 'hermes',
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Bot → user notifications (called by /cloud-agent/notify)
  // ═══════════════════════════════════════════════════════════

  /**
   * Delivers a bot's proactive message to the user as a push notification.
   * The instance authenticates with its per-instance GROKBOT_NOTIFY_TOKEN,
   * so a compromised instance can only message its own owner — not others.
   */
  async deliverBotNotification(params: { instanceId: string; token: string; botHandle: string; text: string }) {
    const record = await this.prisma.userInstance.findUnique({
      where: { instanceId: params.instanceId },
    });
    if (!record || !record.notifyToken || record.notifyToken !== params.token) {
      return { ok: false, reason: 'Unauthorized' };
    }

    const bot = await this.prisma.bot.findFirst({
      where: { userId: record.userId, handle: params.botHandle.toLowerCase() },
    });

    const title = bot ? bot.name : 'Your cloud agent';
    await this.push.sendToUser(record.userId, {
      title,
      body: params.text,
      data: { type: 'cloud-agent-notify', bot: params.botHandle },
    });
    return { ok: true, bot: bot?.handle ?? null };
  }

  async deleteRoutine(userId: string, _botId: string, cronName: string) {
    this.assertKey();
    const instance = await this.getInstanceOrThrow(userId);
    return this.request('DELETE', `/v1/instances/${instance.instanceId}/crons/${encodeURIComponent(cronName)}`);
  }

  async testRoutine(userId: string, _botId: string, cronName: string) {
    this.assertKey();
    const instance = await this.getInstanceOrThrow(userId);
    return this.request('POST', `/v1/instances/${instance.instanceId}/crons/${encodeURIComponent(cronName)}/run`);
  }

  // ═══════════════════════════════════════════════════════════
  // Tools
  // ═══════════════════════════════════════════════════════════

  /**
   * Agent37 wraps list responses in an envelope (e.g. {toolkits:[...]}); clients
   * expect a bare array. Returning the raw body made every client hit its
   * `Array.isArray(x) ? x : []` guard and silently render an empty catalog with
   * no error. Normalize here so the shape is guaranteed, and log anything we
   * don't recognise so the next oddity is visible instead of silent.
   */
  private toArray<T>(payload: unknown, keys: string[], label: string): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === 'object') {
      for (const k of keys) {
        const v = (payload as Record<string, unknown>)[k];
        if (Array.isArray(v)) return v as T[];
      }
    }
    this.logger.warn(
      `Agent37 ${label} returned an unrecognised shape: ${JSON.stringify(payload).slice(0, 200)}`,
    );
    return [];
  }

  async listToolkits(userId: string, search?: string) {
    this.assertKey();
    const instance = await this.getInstanceOrThrow(userId);
    const params = new URLSearchParams({ limit: '24' });
    if (search) params.set('search', search);
    const raw = await this.request(
      'GET',
      `/v1/instances/${instance.instanceId}/integrations/toolkits?${params.toString()}`,
    );
    return this.toArray<ToolkitDto>(
      raw,
      ['toolkits', 'data', 'items', 'results'],
      'toolkits',
    );
  }

  async connectTool(userId: string, toolkit: string) {
    this.assertKey();
    const instance = await this.getInstanceOrThrow(userId);
    return this.request('POST', `/v1/instances/${instance.instanceId}/integrations/connect`, {
      toolkit, callbackUrl: 'https://www.tupliq.com/dashboard',
    });
  }

  async listConnections(userId: string) {
    this.assertKey();
    const instance = await this.getInstanceOrThrow(userId);
    const raw = await this.request(
      'GET',
      `/v1/instances/${instance.instanceId}/integrations/connections`,
    );
    return this.toArray<ConnectionDto>(
      raw,
      ['connections', 'data', 'items', 'results'],
      'connections',
    );
  }

  async disconnectTool(userId: string, toolkit: string) {
    this.assertKey();
    const instance = await this.getInstanceOrThrow(userId);
    return this.request('DELETE', `/v1/instances/${instance.instanceId}/integrations/connections/${encodeURIComponent(toolkit)}`);
  }

  // ═══════════════════════════════════════════════════════════
  // SOUL & notes
  // ═══════════════════════════════════════════════════════════

  async getSoul(userId: string) {
    const instance = await this.getInstanceOrThrow(userId);
    try {
      const res = await fetch(`${instance.instanceUrl}/v1/files/content?path=~/.hermes/SOUL.md`, {
        headers: { 'X-Agent37-Key': this.apiKey },
      });
      if (!res.ok) return { content: '' };
      return { content: await res.text() };
    } catch { return { content: '' }; }
  }

  async updateSoul(userId: string, content: string) {
    const instance = await this.getInstanceOrThrow(userId);
    await this.putFileRaw(instance.instanceUrl, '~/.hermes/SOUL.md', content);
    return { ok: true };
  }

  async getBotNotes(userId: string, botId: string) {
    const instance = await this.getInstanceOrThrow(userId);
    const bot = await this.prisma.bot.findFirst({ where: { id: botId, userId } });
    if (!bot) throw new NotFoundException('Bot not found.');
    try {
      const res = await fetch(`${instance.instanceUrl}/v1/files/content?path=~/bots/${encodeURIComponent(bot.handle)}/notes.md`, {
        headers: { 'X-Agent37-Key': this.apiKey },
      });
      if (!res.ok) return { content: '' };
      return { content: await res.text() };
    } catch { return { content: '' }; }
  }

  async updateBotNotes(userId: string, botId: string, content: string) {
    const instance = await this.getInstanceOrThrow(userId);
    const bot = await this.prisma.bot.findFirst({ where: { id: botId, userId } });
    if (!bot) throw new NotFoundException('Bot not found.');
    await this.putFileRaw(instance.instanceUrl, `~/bots/${bot.handle}/notes.md`, content);
    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════
  // Connection sync (called from getStatus)
  // ═══════════════════════════════════════════════════════════

  private async syncConnections(instanceId: string) {
    try {
      const connRes = await fetch(`${AGENT37_API}/v1/instances/${instanceId}/integrations/connections`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (connRes.ok) {
        const conns: any[] = await connRes.json();
        const record = await this.prisma.userInstance.findFirst({ where: { instanceId } });
        if (!record) return;
        for (const c of conns) {
          await this.prisma.instanceConnection.upsert({
            where: { instanceId_toolkit: { instanceId: record.id, toolkit: c.toolkit } },
            create: { instanceId: record.id, toolkit: c.toolkit, account: c.account ?? null, status: c.status ?? 'active' },
            update: { account: c.account ?? null, status: c.status ?? 'active' },
          });
        }
      }
    } catch { /* non-fatal */ }
  }

  // ═══════════════════════════════════════════════════════════
  // SSE streaming helper
  // ═══════════════════════════════════════════════════════════

  private async streamFromInstance(instanceUrl: string, body: Record<string, unknown>, sessionId: string | undefined, onEvent: (event: string, data: unknown) => void) {
    const url = `${instanceUrl}/v1/responses`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-Agent37-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const text = await res.text(); throw new BadRequestException(`Agent37 error ${res.status}: ${text}`); }
    const reader = res.body?.getReader();
    if (!reader) throw new BadRequestException('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let finalSessionId = sessionId;
    let eventType: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ') && eventType) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.session_id) finalSessionId = parsed.session_id;
            onEvent(eventType, parsed);
          } catch { /* skip malformed */ }
          eventType = undefined;
        }
      }
    }
    return { sessionId: finalSessionId };
  }

  // ═══════════════════════════════════════════════════════════
  // Sync connections on status refresh
  // ═══════════════════════════════════════════════════════════

  async refreshStatus(userId: string) {
    const record = await this.prisma.userInstance.findUnique({ where: { userId } });
    if (!record || record.status === 'deleted') return null;
    if (this.apiKey) {
      try {
        const res = await fetch(`${AGENT37_API}/v1/instances/${record.instanceId}`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        if (res.ok) {
          const inst = (await res.json()) as Agent37Instance;
          if (inst.status !== record.status) {
            await this.prisma.userInstance.update({ where: { userId }, data: { status: inst.status } });
            record.status = inst.status;
          }
        }
        await this.syncConnections(record.instanceId);
      } catch { /* non-fatal */ }
    }
    return record;
  }
}
