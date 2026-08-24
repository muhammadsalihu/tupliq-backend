import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { UsageService } from '../usage/usage.service';
import { RequestUser } from '../auth/decorators/current-user.decorator';
import { ProviderChainService } from './providers/provider-chain.service';
import { IntentRouterService } from './workflows/intent-router.service';
import { WorkflowRegistry } from './workflows/workflow-registry';
import { BASE_SYSTEM, WorkflowDefinition, WorkflowFieldDef } from './workflows/types';
import { RunAgentDto } from './dto/run-agent.dto';
import { extractJson } from './lib/extract-json';

export type SseSend = (event: string, data: unknown) => void;

interface StepEntry {
  key: string;
  label: string;
  detail?: string | null;
  startedAt: string;
  durationMs?: number | null;
}

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 90_000);
const MAX_GENERATION_PASSES = 2; // initial + one bounded repair pass

/** Records execution steps for the run row and live SSE events. */
class StepRecorder {
  private readonly entries: StepEntry[] = [];
  private currentStart = 0;

  start(key: string, label: string, send?: SseSend): void {
    this.currentStart = Date.now();
    this.entries.push({ key, label, startedAt: new Date().toISOString(), detail: null });
    send?.('step', this.entries[this.entries.length - 1]);
  }

  finish(detail?: string): void {
    const last = this.entries[this.entries.length - 1];
    if (!last) return;
    last.durationMs = Date.now() - this.currentStart;
    if (detail !== undefined) last.detail = detail;
  }

  snapshot(): StepEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }
}

const customFieldsSchema = z.array(
  z.object({
    name: z.string().min(1).max(64),
    label: z.string().min(1).max(128),
    type: z.enum(['text', 'textarea', 'select', 'number']).catch('text'),
    required: z.boolean().catch(false),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
  }),
);

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly usage: UsageService,
    private readonly providerChain: ProviderChainService,
    private readonly router: IntentRouterService,
    private readonly registry: WorkflowRegistry,
    private readonly config: ConfigService,
  ) {}

  /** Public workflow catalog consumed by the mobile app. */
  catalog() {
    return this.registry.all().map((w) => ({
      key: w.key,
      name: w.name,
      tagline: w.tagline,
      icon: w.icon,
      premium: w.premium,
      fields: w.fields,
    }));
  }

  /**
   * Executes a run end to end, streaming progress via SSE events:
   * step → run(id) → step… → result | error. Never throws after headers are
   * sent; every failure path emits an `error` event.
   */
  async runStream(dto: RunAgentDto, user: RequestUser, send: SseSend): Promise<void> {
    const startedAt = Date.now();
    const steps = new StepRecorder();

    try {
      steps.start('understanding', 'Understanding your request', send);

      const profile = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true, role: true, aiPreference: true },
      });
      if (!profile) throw new NotFoundException('User not found');

      let preference = profile.aiPreference || 'auto';
      let inputs: Record<string, string> = { ...(dto.input ?? {}) };
      let definition: WorkflowDefinition;

      if (dto.customWorkflowId) {
        const custom = await this.prisma.customWorkflow.findFirst({
          where: { id: dto.customWorkflowId, userId: user.id },
        });
        if (!custom) throw new NotFoundException('Custom workflow not found');
        await this.requirePro(user.id);
        preference = custom.aiPreference && custom.aiPreference !== 'auto' ? custom.aiPreference : preference;
        definition = this.customToDefinition(custom);
        // Custom workflows accept the free-form request as their first field.
        if (dto.request?.trim() && Object.keys(inputs).length === 0) {
          const first = definition.fields[0];
          if (first) inputs[first.name] = dto.request.trim();
        }
      } else if (dto.workflowKey && dto.workflowKey !== 'auto') {
        definition = this.registry.require(dto.workflowKey);
        await this.requireProIfPremium(definition, user.id);
        // Enrich missing required fields by extracting them from a provided
        // free-form request instead of failing outright.
        if (dto.request?.trim() && this.missingRequired(definition, inputs).length > 0) {
          const route = await this.router.route(dto.request, preference);
          if (route.workflowKey === definition.key) {
            inputs = { ...route.input, ...inputs };
          }
        }
      } else {
        if (!dto.request?.trim()) {
          throw new BadRequestException({
            code: 'empty_request',
            message: 'Describe what you need or pick a workflow.',
          });
        }
        steps.finish();
        steps.start('planning', 'Planning workflow', send);
        const route = await this.router.route(dto.request, preference);
        const routed = this.registry.get(route.workflowKey);
        if (routed && routed.key !== 'general') {
          await this.requireProIfPremium(routed, user.id);
          definition = routed;
          inputs = { ...route.input, ...inputs };
        } else {
          definition = this.registry.require('general');
          inputs = {
            request: dto.request.trim(),
            ...(Object.keys(inputs).length > 0
              ? { context: JSON.stringify(inputs) }
              : {}),
          };
        }
      }

      const missing = this.missingRequired(definition, inputs);
      if (missing.length > 0) {
        throw new BadRequestException({
          code: 'missing_fields',
          message: `Please provide: ${missing.map((f) => f.label).join(', ')}.`,
          fields: missing,
        });
      }
      steps.finish();

      // Reserve quota atomically — throws UsageLimitException when exhausted.
      steps.start('reserving', 'Checking your plan allowance', send);
      const title = this.buildTitle(definition, inputs, dto.request);
      const runId = await this.usage.reserveRun(user.id, {
        workflowKey: dto.customWorkflowId ? `custom:${dto.customWorkflowId}` : definition.key,
        customWorkflowId: dto.customWorkflowId ?? null,
        title,
        request: dto.request?.trim() || title,
        input: inputs,
      });
      steps.finish();
      send('run', { runId });

      // Generate with the provider chain (bounded attempts + repair pass).
      steps.start('generating', 'Generating results', send);
      let completion;
      try {
        completion = await this.generateValidated(
          definition,
          inputs,
          { userName: profile.name, role: profile.role },
          preference,
          send,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'The AI service could not complete this run.';
        this.logger.error(`Run ${runId} failed: ${message}`);
        await this.usage.failAndRefund(runId, message, Date.now() - startedAt);
        send('error', {
          code: 'generation_failed',
          message:
            'Tupliq Agent could not complete this run right now. Nothing was counted against your monthly usage — please try again.',
        });
        return;
      }
      steps.finish(completion.provider);
      steps.start('saving', 'Saving your results', send);

      const durationMs = Date.now() - startedAt;
      await this.usage.completeRun(runId, {
        result: completion.parsed,
        provider: completion.provider,
        model: completion.model,
        durationMs,
        steps: steps.snapshot(),
      });

      const run = await this.prisma.workflowRun.findUnique({ where: { id: runId } });
      steps.finish();

      send('result', {
        id: run?.id ?? runId,
        workflowKey: run?.workflowKey ?? definition.key,
        title: run?.title ?? title,
        status: 'succeeded',
        provider: completion.provider,
        model: completion.model,
        durationMs,
        createdAt: (run?.createdAt ?? new Date()).toISOString(),
        input: inputs,
        steps: steps.snapshot(),
        result: completion.parsed,
      });
    } catch (error) {
      this.emitError(error, send);
    }
  }

  /**
   * Bounded generation loop: up to MAX_GENERATION_PASSES chain executions.
   * Validation failures trigger one repair pass; provider exhaustion aborts
   * immediately so we never retry expensive requests indefinitely.
   */
  private async generateValidated(
    definition: WorkflowDefinition,
    inputs: Record<string, string>,
    ctx: { userName?: string | null; role?: string | null },
    preference: string,
    send: SseSend,
  ): Promise<{ parsed: unknown; provider: string; model: string }> {
    const prompts = definition.buildPrompts(inputs, ctx);
    let validationIssues: string | null = null;

    for (let pass = 1; pass <= MAX_GENERATION_PASSES; pass++) {
      const userPrompt =
        validationIssues === null
          ? prompts.user
          : `${prompts.user}\n\nYour previous response had these JSON validation problems:\n${validationIssues}\n\nReturn the corrected single JSON object only.`;

      send('step', {
        key: 'model_selected',
        label: 'Selecting AI model',
        startedAt: new Date().toISOString(),
      });

      const completion = await this.providerChain.generateWithFallback(
        {
          system: prompts.system,
          user: userPrompt,
          temperature: 0.7,
          maxTokens: 4096,
          signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        },
        preference,
      );
      send('step', {
        key: 'model_selected',
        label: 'Selecting AI model',
        detail: `${completion.provider} · ${completion.model}`,
        startedAt: new Date().toISOString(),
      });

      try {
        const raw = extractJson(completion.text);
        const parsed = definition.schema.safeParse(raw);
        if (parsed.success) {
          return { parsed: parsed.data, provider: completion.provider, model: completion.model };
        }
        validationIssues = parsed.error.issues
          .slice(0, 8)
          .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('\n');
      } catch (parseError) {
        validationIssues =
          parseError instanceof Error ? parseError.message : 'Response was not valid JSON.';
      }
      this.logger.warn(`Structured output failed validation (pass ${pass}); repairing.`);
    }

    throw new Error('AI response could not be parsed into the expected format.');
  }

  /** Adapts a stored custom workflow into the runtime WorkflowDefinition shape. */
  private customToDefinition(custom: {
    id: string;
    name: string;
    description: string;
    instructions: string;
    inputFields: unknown;
  }): WorkflowDefinition {
    const parsedFields = customFieldsSchema.catch([]).parse(custom.inputFields ?? []);
    const fields: WorkflowFieldDef[] = parsedFields.length
      ? parsedFields
      : [{ name: 'content', label: 'Input', type: 'textarea', required: true }];

    return {
      key: `custom:${custom.id}`,
      name: custom.name,
      tagline: custom.description,
      icon: 'hammer-outline',
      premium: true,
      fields,
      schema: z
        .object({
          output_markdown: z.string().min(1),
          summary: z.string().min(1),
        })
        .passthrough(),
      buildPrompts(input) {
        return {
          system: [
            'You are Tupliq Agent executing a reusable custom workflow defined by the user.',
            "Follow the user's instructions precisely and produce a complete, professional work product.",
            BASE_SYSTEM.split('\n').slice(-5).join('\n'),
          ].join('\n'),
          user: `## Custom workflow: ${custom.name}\n\n## Instructions\n${custom.instructions}\n\n${[
            ...Object.entries(input)
              .filter(([, v]) => v && v.trim())
              .map(([k, v]) => `## ${k.replace(/_/g, ' ')}\n${v}`),
          ].join('\n\n')}\n\nReturn JSON with exactly this shape:\n{\n  "output_markdown": "the complete work product in markdown",\n  "summary": "one-sentence summary of what you produced"\n}`,
        };
      },
    };
  }

  private missingRequired(definition: WorkflowDefinition, inputs: Record<string, string>) {
    return definition.fields.filter((f) => f.required && !inputs[f.name]?.trim());
  }

  private buildTitle(
    definition: WorkflowDefinition,
    inputs: Record<string, string>,
    request?: string,
  ): string {
    const firstValue = Object.values(inputs).find((v) => v && v.trim().length > 2);
    const source = request?.trim() || firstValue || definition.name;
    return source.length > 72 ? `${source.slice(0, 72)}…` : source;
  }

  private async requirePro(userId: string): Promise<void> {
    if (!(await this.billing.isPro(userId))) {
      throw new ForbiddenException({
        code: 'pro_required',
        message: 'This feature requires Tupliq Pro.',
      });
    }
  }

  private async requireProIfPremium(definition: WorkflowDefinition, userId: string): Promise<void> {
    if (definition.premium) await this.requirePro(userId);
  }

  private emitError(error: unknown, send: SseSend): void {
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const body = error.getResponse() as Record<string, unknown>;
      const payload =
        typeof body === 'object' && body !== null
          ? body
          : { code: 'request_failed', message: String(body) };
      send('error', { statusCode: status, ...payload });
      return;
    }
    this.logger.error(`Unexpected agent error: ${error instanceof Error ? error.stack : error}`);
    send('error', { statusCode: 500, code: 'internal_error', message: 'Something went wrong.' });
  }
}
