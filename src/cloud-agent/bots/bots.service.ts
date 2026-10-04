import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudAgentService } from '../cloud-agent.service';
import { CreateBotDto, UpdateBotDto } from './dto/bots.dto';

const MAX_BOTS_PER_USER = 10;

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudAgent: CloudAgentService,
  ) {}

  async create(userId: string, dto: CreateBotDto) {
    await this.assertInstance(userId);

    const count = await this.prisma.bot.count({ where: { userId } });
    if (count >= MAX_BOTS_PER_USER)
      throw new BadRequestException(`Maximum ${MAX_BOTS_PER_USER} Bots per user.`);

    const existing = await this.prisma.bot.findUnique({
      where: { userId_handle: { userId, handle: dto.handle } },
    });
    if (existing) throw new BadRequestException(`Handle "${dto.handle}" is already taken.`);

    const bot = await this.prisma.bot.create({
      data: {
        userId, handle: dto.handle, name: dto.name, title: dto.title,
        description: dto.description ?? '', color: dto.color ?? '#4F46E5', avatar: dto.avatar ?? null,
      },
    });

    try {
      const instance = await this.prisma.userInstance.findUnique({ where: { userId } });
      if (instance?.instanceUrl) {
        await this.cloudAgent.putFile(instance, `~/bots/${bot.handle}/notes.md`, `# ${bot.name}'s notes\n`);
        this.logger.log(`Created notes file for bot ${bot.handle}`);
      }
    } catch (err) { this.logger.warn(`Could not create notes file: ${err}`); }

    this.logger.log(`Created bot ${bot.handle} for user ${userId}`);
    return bot;
  }

  async list(userId: string) {
    return this.prisma.bot.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }

  async getOne(userId: string, botId: string) {
    const bot = await this.prisma.bot.findFirst({ where: { id: botId, userId } });
    if (!bot) throw new NotFoundException('Bot not found.');
    return bot;
  }

  async update(userId: string, botId: string, dto: UpdateBotDto) {
    await this.getOne(userId, botId);
    return this.prisma.bot.update({ where: { id: botId }, data: dto });
  }

  async delete(userId: string, botId: string) {
    const bot = await this.getOne(userId, botId);
    try {
      const instance = await this.prisma.userInstance.findUnique({ where: { userId } });
      if (instance?.instanceUrl)
        await this.cloudAgent.deleteFile(instance, `~/bots/${bot.handle}/notes.md`);
    } catch (err) { this.logger.warn(`Could not delete notes file: ${err}`); }
    try { await this.cloudAgent.deleteBotCrons(userId, bot.handle); } catch (err) { this.logger.warn(`Could not delete crons: ${err}`); }
    await this.prisma.bot.delete({ where: { id: bot.id } });
    this.logger.log(`Deleted bot ${bot.handle}`);
    return { ok: true };
  }

  /**
   * Sessions for a Bot, labelled from the instance.
   *
   * The Bot row owns which threads belong to it (the gateway has no such
   * concept), but the LABELS here were timestamp placeholders. The gateway's
   * `GET /v1/sessions` carries real titles, so prefer those and fall back to
   * the stored label only when the harness has nothing for that id.
   */
  async listSessions(userId: string, botId: string) {
    const bot = await this.prisma.bot.findFirst({ where: { id: botId, userId } });
    if (!bot) throw new NotFoundException('Bot not found.');
    const stored = Array.isArray(bot.sessions) ? bot.sessions : [];

    const instance = await this.prisma.userInstance.findUnique({ where: { userId } });
    if (!instance || instance.status === 'deleted' || !instance.instanceUrl) return stored;

    let harness: Record<string, any>[] = [];
    try {
      const key = process.env.AGENT37_API_KEY;
      const res = await fetch(`${instance.instanceUrl}/v1/sessions`, {
        headers: { 'X-Agent37-Key': key ?? '' },
      });
      if (res.ok) {
        const raw = (await res.json()) as any;
        harness = this.toArray(raw, ['data', 'sessions', 'items']);
      }
    } catch {
      // Gateway unreachable — the stored labels still let the UI render.
    }

    const byId = new Map(harness.map((s) => [String(s.id), s]));
    return stored.map((s: any) => {
      const meta = byId.get(String(s.id));
      const preview = typeof meta?.preview === 'string' ? meta.preview : '';
      return {
        id: String(s.id),
        label: meta?.title || s.label || preview.slice(0, 60) || 'Chat',
        messageCount: typeof meta?.message_count === 'number' ? meta.message_count : null,
        lastActive: meta?.last_active ?? null,
        preview: preview ? preview.replace(/\s+/g, ' ').slice(0, 120) : '',
      };
    });
  }

  /** Never blank the UI on a surprise shape. */
  private toArray(v: unknown, keys: string[]): Record<string, any>[] {
    if (Array.isArray(v)) return v as Record<string, any>[];
    if (v && typeof v === 'object') {
      for (const k of keys) {
        const inner = (v as Record<string, unknown>)[k];
        if (Array.isArray(inner)) return inner as Record<string, any>[];
      }
    }
    return [];
  }

  private async assertInstance(userId: string) {
    const instance = await this.prisma.userInstance.findUnique({ where: { userId } });
    if (!instance || instance.status === 'deleted')
      throw new BadRequestException('You must provision a cloud agent first.');
    return instance;
  }
}