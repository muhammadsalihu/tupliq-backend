import { z } from 'zod';
import { WorkflowDefinition, jsonShape, renderUserInput, BASE_SYSTEM } from './types';

export const researchAssistantSchema = z.object({
  question_restated: z.string().min(1),
  key_findings: z.array(z.object({ title: z.string().min(1), detail: z.string().min(1) })).min(1),
  analysis: z.string().min(1),
  source_basis: z.string().min(1),
  conclusion: z.string().min(1),
  next_steps: z.array(z.string()).default([]),
});

export const researchAssistantWorkflow: WorkflowDefinition = {
  key: 'research_assistant',
  name: 'Research Assistant',
  tagline: 'Structured business and market analysis with honest sourcing.',
  icon: 'search-outline',
  premium: false,
  fields: [
    { name: 'research_question', label: 'Research question', type: 'textarea', required: true, placeholder: 'What do you want to understand?' },
    { name: 'context', label: 'Context (optional)', type: 'textarea', required: false, placeholder: 'Your business, audience, what prompted this…' },
    { name: 'target_outcome', label: 'Target outcome (optional)', type: 'text', required: false, placeholder: 'Decide whether to reach out / pick a niche / price my offer' },
  ],
  schema: researchAssistantSchema,
  buildPrompts(input) {
    return {
      system: `${BASE_SYSTEM}\n\nYou are a rigorous research analyst. You do NOT have live web access in this deployment. Base your answer on your training knowledge, clearly reason about uncertainty, and NEVER fabricate sources, statistics with fake precision, or claims of having browsed the web. Separate established knowledge from inference.`,
      user: `Research this for me.

${renderUserInput(input)}

Return JSON with exactly this shape:
{
${jsonShape({
  question_restated: 'the research question restated precisely',
  key_findings: 'array of objects: {"title": short heading, "detail": 1-3 sentence finding}',
  analysis: 'your deeper interpretation: implications, trade-offs, what it means for the requester',
  source_basis: 'honest note on the basis of these findings (training knowledge vs inference) and their confidence level',
  conclusion: 'direct structured answer to the question',
  next_steps: 'array of suggested follow-up actions or information worth verifying',
})}
}`,
    };
  },
};
