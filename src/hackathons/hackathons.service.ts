import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHackathonDto } from './dto/create-hackathon.dto';
import { UpdateHackathonDto } from './dto/update-hackathon.dto';
import { HackathonDto } from './types/hackathon.type';

const withNestedLists = {
  lessons: { orderBy: { position: Prisma.SortOrder.asc } },
  videos: { orderBy: { position: Prisma.SortOrder.asc } },
  partners: { orderBy: { position: Prisma.SortOrder.asc } },
} satisfies Prisma.HackathonInclude;

type HackathonWithLists = Prisma.HackathonGetPayload<{ include: typeof withNestedLists }>;

function toDto(hackathon: HackathonWithLists): HackathonDto {
  return {
    id: hackathon.id,
    title: hackathon.title,
    tag: hackathon.tag,
    desc: hackathon.desc,
    meta: hackathon.meta,
    lessons: hackathon.lessons.map((l) => ({ id: l.id, title: l.title })),
    videos: hackathon.videos.map((v) => ({ id: v.id, title: v.title, duration: v.duration })),
    partners: hackathon.partners.map((p) => ({ id: p.id, name: p.name })),
  };
}

@Injectable()
export class HackathonsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<HackathonDto[]> {
    const hackathons = await this.prisma.hackathon.findMany({
      include: withNestedLists,
      orderBy: { createdAt: 'desc' },
    });
    return hackathons.map(toDto);
  }

  async findOne(id: string): Promise<HackathonDto> {
    const hackathon = await this.prisma.hackathon.findUnique({
      where: { id },
      include: withNestedLists,
    });
    if (!hackathon) throw new NotFoundException('Hackathon not found');
    return toDto(hackathon);
  }

  async create(dto: CreateHackathonDto): Promise<HackathonDto> {
    const hackathon = await this.prisma.hackathon.create({
      data: {
        title: dto.title,
        tag: dto.tag,
        desc: dto.desc,
        meta: dto.meta,
        lessons: dto.lessons
          ? { create: dto.lessons.map((l, i) => ({ title: l.title, position: i })) }
          : undefined,
        videos: dto.videos
          ? {
              create: dto.videos.map((v, i) => ({
                title: v.title,
                duration: v.duration,
                position: i,
              })),
            }
          : undefined,
        partners: dto.partners
          ? { create: dto.partners.map((p, i) => ({ name: p.name, position: i })) }
          : undefined,
      },
      include: withNestedLists,
    });
    return toDto(hackathon);
  }

  // Nested lists (lessons/videos/partners), when provided, fully replace the
  // existing set — simplest correct semantics for an admin edit form.
  async update(id: string, dto: UpdateHackathonDto): Promise<HackathonDto> {
    await this.findOne(id);

    const hackathon = await this.prisma.hackathon.update({
      where: { id },
      data: {
        title: dto.title,
        tag: dto.tag,
        desc: dto.desc,
        meta: dto.meta,
        lessons: dto.lessons
          ? {
              deleteMany: {},
              create: dto.lessons.map((l, i) => ({ title: l.title, position: i })),
            }
          : undefined,
        videos: dto.videos
          ? {
              deleteMany: {},
              create: dto.videos.map((v, i) => ({
                title: v.title,
                duration: v.duration,
                position: i,
              })),
            }
          : undefined,
        partners: dto.partners
          ? {
              deleteMany: {},
              create: dto.partners.map((p, i) => ({ name: p.name, position: i })),
            }
          : undefined,
      },
      include: withNestedLists,
    });
    return toDto(hackathon);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.hackathon.delete({ where: { id } });
  }

  async leave(userId: string, hackathonId: string): Promise<void> {
    await this.prisma.hackathonParticipant.deleteMany({
      where: { userId, hackathonId },
    });
  }

  async toggleLesson(userId: string, lessonId: string): Promise<{ completed: boolean }> {
    const existing = await this.prisma.lessonCompletion.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });

    if (existing) {
      await this.prisma.lessonCompletion.delete({
        where: { userId_lessonId: { userId, lessonId } },
      });
      return { completed: false };
    }

    await this.prisma.lessonCompletion.create({ data: { userId, lessonId } });
    return { completed: true };
  }
}
