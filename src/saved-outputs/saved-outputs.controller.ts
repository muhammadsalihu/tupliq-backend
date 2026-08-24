import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';

class SaveOutputDto {
  @IsString()
  @MinLength(1)
  runId!: string;
}

@ApiTags('saved-outputs')
@ApiBearerAuth('bearer')
@Controller('saved-outputs')
@UseGuards(JwtAuthGuard)
export class SavedOutputsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.prisma.savedOutput.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: SaveOutputDto) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: dto.runId, userId: user.id },
    });
    if (!run || !run.result) throw new NotFoundException('Run not found or has no output');

    return this.prisma.savedOutput.create({
      data: {
        userId: user.id,
        runId: run.id,
        kind: run.workflowKey,
        title: run.title,
        content: run.result as object,
      },
    });
  }

  @Delete(':id')
  async remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.savedOutput.deleteMany({ where: { id, userId: user.id } });
    return { ok: true };
  }
}
