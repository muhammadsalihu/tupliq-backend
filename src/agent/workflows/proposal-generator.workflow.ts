import { z } from 'zod';
import { WorkflowDefinition, jsonShape, renderUserInput, BASE_SYSTEM } from './types';

export const proposalSchema = z.object({
  project_understanding: z.string().min(1),
  scope: z.array(z.string()).min(1),
  deliverables: z.array(z.string()).min(1),
  timeline: z.string().min(1),
  pricing_suggestions: z.string().min(1),
  risks_and_questions: z.array(z.string()).default([]),
  proposal_markdown: z.string().min(1),
  cover_message: z.string().min(1),
});

export const proposalGeneratorWorkflow: WorkflowDefinition = {
  key: 'proposal_generator',
  name: 'Proposal Generator',
  tagline: 'From client brief to a complete, structured proposal.',
  icon: 'document-text-outline',
  premium: false,
  fields: [
    { name: 'client_brief', label: 'Client brief', type: 'textarea', required: true, placeholder: 'Paste the brief, RFP or everything the client told you…' },
    { name: 'requirements', label: 'Project requirements (optional)', type: 'textarea', required: false, placeholder: 'Must-haves, tech stack, constraints…' },
    { name: 'budget', label: 'Budget (optional)', type: 'text', required: false, placeholder: '$2,000–3,000 / unknown' },
    { name: 'timeline', label: 'Timeline (optional)', type: 'text', required: false, placeholder: '6 weeks / by end of Q3' },
    { name: 'business_info', label: 'Your business info (optional)', type: 'textarea', required: false, placeholder: 'Who you are, relevant experience, what you offer…' },
  ],
  schema: proposalSchema,
  buildPrompts(input, ctx) {
    return {
      system: `${BASE_SYSTEM}\n\nYou write winning freelance/consulting proposals. They must be concrete: reflect the actual brief, quantify where possible, flag real risks, and read like they were written by an experienced professional — not a template.`,
      user: `Write a project proposal for ${ctx.userName ?? 'the sender'}${
        ctx.role ? ` (${ctx.role.replace(/_/g, ' ')})` : ''
      } based on this brief.

${renderUserInput(input)}

Return JSON with exactly this shape:
{
${jsonShape({
  project_understanding: '2-4 sentence summary proving you understand the client problem',
  scope: 'array of scope items (each one clear workstream)',
  deliverables: 'array of concrete deliverables',
  timeline: 'phased timeline with durations',
  pricing_suggestions: 'pricing recommendation with rationale; if budget given, position within it; if unknown, suggest range and structure',
  risks_and_questions: 'array of honest risks and open questions to clarify with the client',
  proposal_markdown: 'complete polished proposal in markdown (headings ##, sections: Understanding, Approach & Scope, Deliverables, Timeline, Investment, Why Me, Next Steps)',
  cover_message: 'short friendly cover message (under 150 words) to send with the proposal',
})}
}`,
    };
  },
};
