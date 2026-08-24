import { z } from 'zod';

/** Shared building blocks */
const titleSchema = z.string().min(1);
const sectionsSchema = z.array(z.object({ heading: z.string(), body: z.string() }));

// ─── Workflow 1: Client Follow-Up ───────────────────────────────────────────
export const clientFollowupSchema = z.object({
  recommendedNextAction: z.string(),
  subject: z.string(),
  primaryMessage: z.string(),
  alternativeVersion: z.string(),
});

// ─── Workflow 2: Proposal Generator ─────────────────────────────────────────
export const proposalGeneratorSchema = z.object({
  projectUnderstanding: z.string(),
  scope: z.string(),
  deliverables: z.array(z.string()),
  timeline: z.string(),
  pricingSuggestions: z.string(),
  risksAndQuestions: z.array(z.string()),
  proposal: z.string(),
  coverMessage: z.string(),
});

// ─── Workflow 3: Meeting to Tasks ───────────────────────────────────────────
export const meetingToTasksSchema = z.object({
  summary: z.string(),
  decisions: z.array(z.string()),
  actionItems: z.array(
    z.object({
      task: z.string(),
      owner: z.string().nullable(),
      deadline: z.string().nullable(),
    }),
  ),
  risks: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

// ─── Workflow 4: Daily Work Planner ─────────────────────────────────────────
export const dailyPlannerSchema = z.object({
  prioritizedTasks: z.array(z.object({ task: z.string(), priority: z.string(), reason: z.string() })),
  schedule: z.array(z.object({ timeBlock: z.string(), focus: z.string() })),
  focusSessions: z.number().int(),
  deadlineWarnings: z.array(z.string()),
  firstAction: z.string(),
});

// ─── Workflow 5: Research Assistant ─────────────────────────────────────────
export const researchAssistantSchema = z.object({
  understanding: z.string(),
  keyFindings: z.array(z.string()),
  analysis: z.string(),
  conclusion: z.string(),
  sourcesNote: z.string(), // honest note on whether live web search was used
});

// ─── Workflow 6: Content Repurposer ─────────────────────────────────────────
export const contentRepurposerSchema = z.object({
  linkedinPost: z.string(),
  xPost: z.string(),
  shortPost: z.string(),
  hooks: z.array(z.string()),
  callToActions: z.array(z.string()),
});

// ─── General / router / custom ──────────────────────────────────────────────
export const intentRouterSchema = z.object({
  workflowKey: z.enum([
    'client_followup',
    'proposal_generator',
    'meeting_to_tasks',
    'daily_planner',
    'research_assistant',
    'content_repurposer',
    'general',
  ]),
  extractedInput: z.record(z.string()),
  confidence: z.number().min(0).max(1),
});

export const generalAgentSchema = z.object({
  understanding: z.string(),
  result: z.union([z.string(), sectionsSchema]),
  suggestedWorkflow: z.string().nullable(),
});

export const customWorkflowSchema = z.object({
  result: z.string(),
});

export type ClientFollowupOutput = z.infer<typeof clientFollowupSchema>;
export type ProposalGeneratorOutput = z.infer<typeof proposalGeneratorSchema>;
export type MeetingToTasksOutput = z.infer<typeof meetingToTasksSchema>;
export type DailyPlannerOutput = z.infer<typeof dailyPlannerSchema>;
export type ResearchAssistantOutput = z.infer<typeof researchAssistantSchema>;
export type ContentRepurposerOutput = z.infer<typeof contentRepurposerSchema>;
export type IntentRouterOutput = z.infer<typeof intentRouterSchema>;
export type GeneralAgentOutput = z.infer<typeof generalAgentSchema>;
