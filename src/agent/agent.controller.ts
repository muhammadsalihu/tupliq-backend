import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { UsageService } from './usage.service';
import { ProviderRegistry } from './provider-registry.service';
import { WorkflowCatalog } from './workflow-catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { RunAgentDto } from './dto/run-agent.dto';

class SaveOutputDto {
  @IsOptional() @IsString() @MaxLength(80) kind?: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(80) runId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content!: any;
}

class ListRunsQuery {
  @IsOptional() @IsInt() @Max(100) limit?: number;
}

@ApiTags('agent')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly usage: UsageService,
    private readonly registry: ProviderRegistry,
    private readonly catalog: WorkflowCatalog,
    private readonly prisma: PrismaService,
  ) {}

  @Post('agent/run')
  @ApiOperation({ summary: 'Run an agent workflow (consumes quota on success).' })
  async run(@CurrentUser() user: RequestUser, @Body() dto: RunAgentDto) {
    return this.orchestrator.run(user.id, dto);
  }

  @Get('workflows')
  @ApiOperation({ summary: 'List available system workflows.' })
  listWorkflows() {
    return { workflows: this.catalog.all(), providers: this.registry.availableProviders() };
  }

  @Get('workflow-runs')
  @ApiOperation({ summary: 'Workflow run history for the current user.' })
  async listRuns(@CurrentUser() user: RequestUser, @Query() query: ListRunsQuery) {
    const runs = await this.prisma.workflowRun.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.limit ?? 50, 100),
      select: {
        id: true,
        workflowKey: true,
        title: true,
        status: true,
        provider: true,
        model: true,
        durationMs: true,
        createdAt: true,
      },
    });
    return { runs };
  }

  @Get('workflow-runs/:id')
  @ApiOperation({ summary: 'Full detail of one run (result included).' })
  async getRun(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id, userId: user.id },
    });
    if (!run) return { error: 'Not found' };
    return run;
  }

  @Delete('workflow-runs/:id')
  async deleteRun(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.prisma.workflowRun.deleteMany({ where: { id, userId: user.id } });
    return { ok: true };
  }

  @Get('usage')
  @ApiOperation({ summary: 'Current billing period usage + plan limits.' })
  async usageStatus(@CurrentUser() user: RequestUser) {
    const status = await this.usage.checkQuota(user.id);
    return {
      plan: status.plan.toLowerCase(),
      runsUsed: status.runsUsed,
      runsLimit: status.runsLimit,
      remaining: status.remaining,
    };
  }

  @Get('billing/status')
  @ApiOperation({ summary: 'Entitlement status (server-side truth).' })
  async billingStatus(@CurrentUser() user: RequestUser) {
    const isPro = await this.usage.hasProEntitlement(user.id);
    const status = await this.usage.checkQuota(user.id);
    return {
      plan: isPro ? 'pro' : 'free',
      entitlement: 'tupliq_pro',
      active: isPro,
      runsUsed: status.runsUsed,
      runsLimit: status.runsLimit,
      remaining: status.remaining,
    };
  }

  @Post('saved-outputs')
  @ApiOperation({ summary: 'Save a workflow output.' })
  async saveOutput(@CurrentUser() user: RequestUser, @Body() dto: SaveOutputDto) {
    const saved = await this.prisma.savedOutput.create({
      data: {
        userId: user.id,
        runId: dto.runId ?? null,
        kind: dto.kind ?? 'general',
        title: dto.title,
        content: dto.content ?? {},
      },
    });
    return saved;
  }

  @Get('saved-outputs')
  async listSavedOutputs(@CurrentUser() user: RequestUser) {
    const outputs = await this.prisma.savedOutput.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { outputs };
  }

  @Delete('saved-outputs/:id')
  async deleteSavedOutput(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.prisma.savedOutput.deleteMany({ where: { id, userId: user.id } });
    return { ok: true };
  }
}
