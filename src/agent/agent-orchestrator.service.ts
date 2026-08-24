import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService } from './usage.service';
import { ProviderRegistry } from './provider-registry.service';
import { WorkflowCatalog } from './workflow-catalog.service';
import { RunAgentDto } from './dto/run-agent.dto';

export interface AgentStep {
  key: string;
  label: string;
  detail?: string;
  startedAt: string;
  durationMs?: number;
}

@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
    private readonly registry: ProviderRegistry,
    private readonly catalog: WorkflowCatalog,
  ) {}

  async run(userId: string, dto: RunAgentDto) {
    const startedAt = new Date();
    const steps: AgentStep[] = [];
    const step = async <T>(key: string, label: string, fn: () => Promise<T>): Promise<T> => {
      const t0 = Date.now();
      steps.push({ key, label, startedAt: new Date(t0).toISOString() });
      try {
        const result = await fn();
        steps[steps.length - 1].durationMs = Date.now() - t0;
        return result;
      } catch (error) {
        steps[steps.length - 1].durationMs = Date.now() - t0;
        throw error;
      }
    };

    // ── 1. Understand the request → resolve workflow + inputs ────────────────
    let workflowKey = dto.workflowId;
    let input: Record<string, string> = dto.input ?? {};
    let title = 'Agent run';
    let customWorkflowId: string | null = null;

    if (workflowKey === 'auto' || !workflowKey) {
      if (!dto.request) throw new BadRequestException('request is required for auto mode');
      const route = await step('understand', 'Understanding your request', () =>
        this.catalog.route(dto.request!),
      );
      workflowKey = route.workflowKey;
      input = { ...route.extractedInput, request: dto.request };
    }

    await step('plan', 'Planning workflow', async () => undefined);

    // Resolve custom workflow
    let customDef: ReturnType<WorkflowCatalog['customDef']> | null = null;
    if (workflowKey.startsWith('custom:')) {
      customWorkflowId = workflowKey.slice('custom:'.length);
      const wf = await this.prisma.customWorkflow.findUnique({ where: { id: customWorkflowId } });
      if (!wf || wf.userId !== userId) throw new NotFoundException('Custom workflow not found');
      customDef = this.catalog.customDef(wf.name, wf.instructions);
      title = wf.name;
    }

    const def = customDef ?? this.catalog.get(workflowKey);
    if (!def) throw new BadRequestException(`Unknown workflow: ${workflowKey}`);
    if (!customDef) title = def.title;

    // Premium workflows / custom workflows require Pro.
    if (customDef) {
      const isPro = await this.usage.hasProEntitlement(userId);
      if (!isPro) {
        throw new ForbiddenException('Custom workflows are a Tupliq Pro feature.');
      }
    }

    // ── 2. Server-side usage enforcement ────────────────────────────────────
    const usage = await this.usage.checkQuota(userId);
    if (!usage.allowed) {
      const err = new ForbiddenException(usage.reason);
      (err as unknown as { code: string }).code = 'USAGE_LIMIT_REACHED';
      (err as unknown as { usage: unknown }).usage = usage;
      throw err;
    }

    // Create the run record up front so history captures in-flight runs.
    const run = await this.prisma.workflowRun.create({
      data: {
        userId,
        workflowKey,
        customWorkflowId,
        title,
        request: dto.request ?? JSON.stringify(input).slice(0, 2000),
        input: input as object,
        billingPeriod: this.usage.currentBillingPeriod(),
      },
    });

    try {
      // ── 3. Select provider ────────────────────────────────────────────────
      const available = this.registry.availableProviders();
      await step('select_model', 'Selecting AI model', async () => undefined);
      if (available.length === 0) {
        throw new Error('No AI provider configured on the server.');
      }
      const preferredProvider =
        dto.aiPreference && dto.aiPreference !== 'auto'
          ? (dto.aiPreference as 'google' | 'openai' | 'anthropic')
          : undefined;

      // ── 4. Execute with structured output + validation (+ one retry) ──────
      const prompts = def.buildPrompts(input);
      const execution = await step(
        'execute',
        `Processing with ${def.title}`,
        async () => {
          let lastError: unknown;
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              return await this.registry.generate({
                ...prompts,
                jsonSchema: def.schema as unknown as Record<string, unknown>,
                preferredProvider,
              });
            } catch (error: unknown) {
              lastError = error;
              const message = error instanceof Error ? error.message : String(error);
              this.logger.warn(`Execution attempt ${attempt} failed: ${message}`);
            }
          }
          throw lastError instanceof Error ? lastError : new Error('AI execution failed');
        },
        // note: step() wraps only once — retry loop lives inside
      );

      const validated = def.schema.safeParse(execution.data);
      if (!validated.success) {
        throw new Error(`AI returned malformed structured output: ${validated.error.issues[0]?.message ?? 'unknown'}`);
      }

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      await step('format', 'Generating results', async () => undefined);

      const updated = await this.prisma.workflowRun.update({
        where: { id: run.id },
        data: {
          status: 'Succeeded',
          result: validated.data as object,
          provider: execution.provider,
          model: execution.model,
          steps: steps as unknown as object[],
          durationMs,
          completedAt,
        },
      });

      return {
        runId: updated.id,
        status: 'completed' as const,
        result: validated.data,
        provider: execution.provider,
        model: execution.model,
        durationMs,
        steps,
        usage: {
          plan: usage.plan,
          runsUsed: usage.runsUsed + 1,
          runsLimit: usage.runsLimit,
          remaining: Math.max(0, usage.remaining - 1),
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.prisma.workflowRun.update({
        where: { id: run.id },
        data: {
          status: 'Failed',
          error: message.slice(0, 1000),
          steps: steps as unknown as object[],
          completedAt: new Date(),
          // Refund quota when the failure is ours/providers', not the user's.
          consumesQuota: false,
        },
      });
      throw error;
    }
  }
}
