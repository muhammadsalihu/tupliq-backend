import { Controller, Delete, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';

const runSelect = {
  id: true,
  workflowKey: true,
  customWorkflowId: true,
  title: true,
  request: true,
  input: true,
  result: true,
  error: true,
  steps: true,
  provider: true,
  model: true,
  status: true,
  durationMs: true,
  createdAt: true,
  completedAt: true,
};

@ApiTags('runs')
@ApiBearerAuth('bearer')
@Controller('runs')
@UseGuards(JwtAuthGuard)
export class RunsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const take = Math.min(Math.max(Number(limit) || 25, 1), 50);
    const skip = Math.max(Number(offset) || 0, 0);
    const [items, total] = await Promise.all([
      this.prisma.workflowRun.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: {
          ...runSelect,
          result: false,
          steps: false,
          input: false,
          request: false,
        },
        take,
        skip,
      }),
      this.prisma.workflowRun.count({ where: { userId: user.id } }),
    ]);
    return { items, total };
  }

  @Get(':id')
  async get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.workflowRun.findFirst({
      where: { id, userId: user.id },
      select: runSelect,
    });
  }

  @Delete(':id')
  async remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.workflowRun.deleteMany({ where: { id, userId: user.id } });
    return { ok: true };
  }
}
