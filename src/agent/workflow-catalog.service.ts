import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ProviderRegistry } from './provider-registry.service';
import { ProviderId } from './providers/provider.interface';
import * as schemas from './schemas/workflow-output.schemas';

interface PromptResult {
  systemPrompt: string;
  userPrompt: string;
}

interface WorkflowDef {
  title: string;
  schema: z.ZodTypeAny;
  buildPrompts: (input: Record<string, string>) => PromptResult;
}

const BASE_SYSTEM = `You are Tupliq Agent, a professional AI operations assistant for remote workers, freelancers, consultants and small businesses.
You produce practical, well-structured, ready-to-use output. Be specific, never generic. Never mention that you are an AI model.`;

function fieldsBlock(input: Record<string, string>): string {
  return Object.entries(input)
    .filter(([, v]) => v && v.trim().length > 0)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
}

/** The six core workflows plus general mode. */
@Injectable()
export class WorkflowCatalog {
  private readonly logger = new Logger(WorkflowCatalog.name);
  private readonly workflows: Map<string, WorkflowDef>;

  constructor(private readonly registry: ProviderRegistry) {
    this.workflows = new Map(
      Object.entries({
        client_followup: {
          title: 'Client Follow-Up',
          schema: schemas.clientFollowupSchema,
          buildPrompts: (input) => ({
            systemPrompt: `${BASE_SYSTEM} You specialise in client communication and follow-ups.`,
            userPrompt: `Write a personalised client follow-up using the details below.

${fieldsBlock(input)}

Return JSON with:
- recommendedNextAction: the single best next action for the sender
- subject: a concise email subject line
- primaryMessage: the main follow-up email body
- alternativeVersion: a shorter/alternate version with a different tone`,
          }),
        },
        proposal_generator: {
          title: 'Proposal Generator',
          schema: schemas.proposalGeneratorSchema,
          buildPrompts: (input) => ({
            systemPrompt: `${BASE_SYSTEM} You write winning freelance/consulting proposals.`,
            userPrompt: `Create a complete project proposal from the brief below.

${fieldsBlock(input)}

Return JSON with: projectUnderstanding, scope, deliverables (list), timeline, pricingSuggestions, risksAndQuestions (list), proposal (full proposal text), coverMessage (short message to send with the proposal).`,
          }),
        },
        meeting_to_tasks: {
          title: 'Meeting to Tasks',
          schema: schemas.meetingToTasksSchema,
          buildPrompts: (input) => ({
            systemPrompt: `${BASE_SYSTEM} You extract structure from unstructured notes.`,
            userPrompt: `Analyse these meeting notes/transcript and extract structure.

${fieldsBlock(input)}

Return JSON with:
- summary: 2-4 sentence meeting summary
- decisions: list of decisions made
- actionItems: list of {task, owner (or null), deadline (or null)}
- risks: list of risks/concerns raised
- nextSteps: ordered next steps`,
          }),
        },
        daily_planner: {
          title: 'Daily Work Planner',
          schema: schemas.dailyPlannerSchema,
          buildPrompts: (input) => ({
            systemPrompt: `${BASE_SYSTEM} You are an expert at realistic time management.`,
            userPrompt: `Plan my work day from the inputs below.

${fieldsBlock(input)}

Return JSON with:
- prioritizedTasks: list of {task, priority (high/medium/low), reason}
- schedule: list of {timeBlock (e.g. "09:00-10:30"), focus}
- focusSessions: estimated number of deep-focus sessions
- deadlineWarnings: warnings about upcoming deadlines
- firstAction: the very first thing to do`,
          }),
        },
        research_assistant: {
          title: 'Research Assistant',
          schema: schemas.researchAssistantSchema,
          buildPrompts: (input) => ({
            systemPrompt: `${BASE_SYSTEM} You do honest analysis. If you could not search live web sources, say so plainly in sourcesNote — never pretend to have searched.`,
            userPrompt: `Research question:

${fieldsBlock(input)}

Return JSON with: understanding (restated question + what a good answer needs), keyFindings (list of findings from your knowledge), analysis (implications for the requester's goal), conclusion (structured conclusion/recommendation), sourcesNote (honest statement that this is knowledge-based analysis without live web search).`,
          }),
        },
        content_repurposer: {
          title: 'Content Repurposer',
          schema: schemas.contentRepurposerSchema,
          buildPrompts: (input) => ({
            systemPrompt: `${BASE_SYSTEM} You adapt content per platform: LinkedIn is professional (120-200 words), X/Twitter is punchy (<280 chars), short posts are casual.`,
            userPrompt: `Repurpose the content below for each platform.

${fieldsBlock(input)}

Return JSON with: linkedinPost, xPost, shortPost, hooks (3 hook options), callToActions (3 CTA options).`,
          }),
        },
        general: {
          title: 'General Agent',
          schema: schemas.generalAgentSchema,
          buildPrompts: (input) => ({
            systemPrompt: `${BASE_SYSTEM}`,
            userPrompt: `${input.request ?? ''}

Additional context:
${fieldsBlock(input)}

Return JSON with: understanding (what the user needs), result (your full answer — either a string or a list of {heading, body} sections), suggestedWorkflow (one of client_followup, proposal_generator, meeting_to_tasks, daily_planner, research_assistant, content_repurposer if one fits better, else null).`,
          }),
        },
      }) as [string, WorkflowDef][],
    );
  }

  get(key: string): WorkflowDef | undefined {
    return this.workflows.get(key);
  }

  all(): { key: string; title: string }[] {
    return [...this.workflows.entries()].map(([key, def]) => ({ key, title: def.title }));
  }

  /** Classify a free-form natural-language request into a workflow key + extracted inputs. */
  async route(request: string): Promise<schemas.IntentRouterOutput> {
    const { systemPrompt, userPrompt } = {
      systemPrompt: `${BASE_SYSTEM} You are a precise request router.`,
      userPrompt: `Classify this user request into the best workflow.

Request: """${request}"""

Workflows:
- client_followup: drafting follow-ups/messages to clients or leads
- proposal_generator: creating proposals or quotes from briefs
- meeting_to_tasks: turning meeting notes/transcripts into tasks
- daily_planner: planning work, priorities, schedules
- research_assistant: researching a company, market, or question
- content_repurposer: adapting content for social platforms
- general: anything else

Also extract any concrete details from the request into extractedInput (keys like clientName, context, goal, notes, question… whatever applies).
Return JSON: {workflowKey, extractedInput, confidence (0-1)}.`,
    };

    const response = await this.registry.generate({
      systemPrompt,
      userPrompt,
      jsonSchema: schemas.intentRouterSchema as unknown as Record<string, unknown>,
      preferredProvider: undefined,
    });

    const parsed = schemas.intentRouterSchema.safeParse(response.data);
    if (!parsed.success) {
      this.logger.warn(`Intent router returned invalid output; falling back to general.`);
      return { workflowKey: 'general', extractedInput: { request }, confidence: 0 };
    }
    return parsed.data;
  }

  /** Run a custom (Pro) workflow defined by the user. */
  customDef(name: string, instructions: string): WorkflowDef {
    return {
      title: name,
      schema: schemas.customWorkflowSchema,
      buildPrompts: (input) => ({
        systemPrompt: `${BASE_SYSTEM} Follow the workflow author's instructions exactly.`,
        userPrompt: `Custom workflow: ${name}

Instructions:
${instructions}

Input:
${fieldsBlock(input)}`,
      }),
    };
  }
}

export type { ProviderId };
