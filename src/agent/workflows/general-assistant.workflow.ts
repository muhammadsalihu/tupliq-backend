import { z } from 'zod';
import { WorkflowDefinition, jsonShape, renderUserInput, BASE_SYSTEM } from './types';

export const generalAssistantSchema = z.object({
  answer_markdown: z.string().min(1),
  key_points: z.array(z.string()).default([]),
  next_steps: z.array(z.string()).default([]),
});

export const generalAssistantWorkflow: WorkflowDefinition = {
  key: 'general',
  name: 'General Agent',
  tagline: 'Any professional task that does not match a specialised workflow.',
  icon: 'sparkles-outline',
  premium: false,
  fields: [
    { name: 'request', label: 'What do you need?', type: 'textarea', required: true, placeholder: 'Describe the task or question…' },
    { name: 'context', label: 'Context (optional)', type: 'textarea', required: false, placeholder: 'Anything Tupliq Agent should know…' },
  ],
  schema: generalAssistantSchema,
  buildPrompts(input, ctx) {
    return {
      system: `${BASE_SYSTEM}\n\nYou are handling a free-form professional request. Produce a genuinely useful, well-organised work product for it — not a chat reply. If the request maps naturally onto a deliverable (email, plan, list, brief), produce that deliverable inside the markdown answer.`,
      user: `${ctx.userName ? `The requester is ${ctx.userName}${ctx.role ? `, a ${ctx.role.replace(/_/g, ' ')}` : ''}.\n\n` : ''}${renderUserInput(input)}

Return JSON with exactly this shape:
{
${jsonShape({
  answer_markdown: 'the complete useful response in markdown',
  key_points: 'array of short takeaways (0-5)',
  next_steps: 'array of suggested follow-up actions (0-4)',
})}
}`,
    };
  },
};
