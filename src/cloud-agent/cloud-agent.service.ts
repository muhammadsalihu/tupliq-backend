import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const AGENT37_API = 'https://api.agent37.com';

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

    const body: Record<string, unknown> = {
      template: 'agent37-hermes',
      resources: { cpu: 2, memory: 4, disk: 4 },
      metadata: { user_id: userId },
    };
    if (name) body.name = name;

    const res = await this.request('POST', '/v1/instances', body);
    const instance = res as Agent37Instance;

    // Upsert in DB
    await this.prisma.userInstance.upsert({
      where: { userId },
      create: {
        userId,
        instanceId: instance.id,
        instanceUrl: instance.url,
        status: instance.status,
        template: instance.template,
      },
      update: {
        instanceId: instance.id,
        instanceUrl: instance.url,
        status: instance.status,
        template: instance.template,
      },
    });

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
}
