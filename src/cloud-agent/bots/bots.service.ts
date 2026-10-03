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

  private async assertInstance(userId: string) {
    const instance = await this.prisma.userInstance.findUnique({ where: { userId } });
    if (!instance || instance.status === 'deleted')
      throw new BadRequestException('You must provision a cloud agent first.');
    return instance;
  }
}