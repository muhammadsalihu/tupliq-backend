import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ProviderChainService } from '../providers/provider-chain.service';
import { extractJson } from '../lib/extract-json';
import { WorkflowRegistry } from './workflow-registry';

const routedSchema = z.object({
  workflowKey: z.string(),
  input: z.record(z.string(), z.string()).optional().default({}),
});

export interface RouteResult {
  workflowKey: string;
  input: Record<string, string>;
}

/** Bounded keyword heuristics used when the LLM router is unavailable. */
const HEURISTICS: { pattern: RegExp; workflowKey: string }[] = [
  /follow[- ]?up|lead|prospect/i,
  /proposal|quote|rfp|pitch document/i,
  /meeting|transcript|call notes|stand-?up notes/i,
  /(plan|schedule).*(day|today|tomorrow)|daily plan|my day/i,
  /research|competitor|market analysis|approach (them|this company)/i,
  /linkedin|\bx\b|twitter|instagram|social media post/i,
].map((pattern, index) => ({
  pattern,
  workflowKey: [
    'client_followup',
    'proposal_generator',
    'meeting_to_tasks',
    'daily_planner',
    'research_assistant',
    'content_repurposer',
  ][index],
}));

@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);

  constructor(
    private readonly providerChain: ProviderChainService,
    private readonly registry: WorkflowRegistry,
  ) {}

  /**
   * Classifies a natural-language request into a workflow and extracts
   * structured inputs. Falls back to keyword heuristics when the routing
   * call fails; never throws.
   */
  async route(request: string, preference?: string | null): Promise<RouteResult> {
    const catalog = this.registry
      .all()
      .map(
        (w) =>
          `- ${w.key}: ${w.name} — ${w.tagline} Fields: ${w.fields.map((f) => f.name).join(', ')}.`,
      )
      .join('\n');

    const system = [
      'You classify professional work requests and extract structured inputs.',
      'Available workflows:',
      catalog,
      '- general: anything that does not match a specialised workflow.',
      '',
      'Rules:',
      '- Choose exactly one workflowKey.',
      '- Extract field values ONLY when the request clearly contains them; omit fields you cannot fill.',
      '- Do not invent details.',
      'Respond with one JSON object only:',
      '{ "workflowKey": string, "input": { [fieldName]: string } }',
    ].join('\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const completion = await this.providerChain.generateWithFallback(
        {
          system,
          user: `Request: """${request.slice(0, 4000)}"""`,
          temperature: 0.2,
          maxTokens: 1200,
          signal: controller.signal,
        },
        preference,
      );
      const parsed = routedSchema.safeParse(extractJson(completion.text));
      if (!parsed.success) throw new Error('router output failed validation');
      return { workflowKey: parsed.data.workflowKey, input: parsed.data.input };
    } catch (error) {
      this.logger.warn(
        `LLM routing failed (${error instanceof Error ? error.message : error}); using heuristics.`,
      );
      return this.heuristicRoute(request);
    } finally {
      clearTimeout(timeout);
    }
  }

  heuristicRoute(request: string): RouteResult {
    for (const { pattern, workflowKey } of HEURISTICS) {
      if (pattern.test(request)) return { workflowKey, input: {} };
    }
    return { workflowKey: 'general', input: {} };
  }
}
