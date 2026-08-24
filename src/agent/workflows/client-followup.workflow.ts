import { z } from 'zod';
import { WorkflowDefinition, jsonShape, renderUserInput, BASE_SYSTEM } from './types';

export const clientFollowupSchema = z.object({
  next_action: z.string().min(1),
  subject_line: z.string().min(1),
  message: z.string().min(1),
  alternative_version: z.string().min(1),
  tips: z.array(z.string()).max(5).default([]),
});

export const clientFollowupWorkflow: WorkflowDefinition = {
  key: 'client_followup',
  name: 'Client Follow-Up Agent',
  tagline: 'Turn lead context into a personalised follow-up that gets replies.',
  icon: 'chatbubbles-outline',
  premium: false,
  fields: [
    { name: 'client_name', label: 'Client name', type: 'text', required: true, placeholder: 'Acme Ltd / Sarah Johnson' },
    { name: 'previous_conversation', label: 'Previous conversation or context', type: 'textarea', required: true, placeholder: 'Paste your last email thread, call notes or how the lead came in…' },
    { name: 'goal', label: 'Desired outcome', type: 'text', required: true, placeholder: 'Book a discovery call this week' },
    { name: 'tone', label: 'Tone', type: 'select', required: false, options: ['Professional', 'Friendly', 'Direct', 'Warm'], placeholder: 'Professional' },
    { name: 'extra_context', label: 'Anything else (optional)', type: 'textarea', required: false, placeholder: 'Pricing discussed, objections, timing constraints…' },
  ],
  schema: clientFollowupSchema,
  buildPrompts(input, ctx) {
    return {
      system: `${BASE_SYSTEM}\n\nYou are drafting a follow-up message to a prospective or existing client. The message must reference concrete details from the previous conversation, propose a clear next step, and be genuinely personalised — never a template.`,
      user: `Write a client follow-up for ${ctx.userName ?? 'the sender'}${
        ctx.role ? ` (${ctx.role.replace(/_/g, ' ')})` : ''
      }.

${renderUserInput(input)}

Return JSON with exactly this shape:
{
${jsonShape({
  next_action: 'one-sentence recommended next action for the sender',
  subject_line: 'email subject line, under 60 characters',
  message: 'primary follow-up email body in plain text with greeting and sign-off',
  alternative_version: 'a shorter, more casual alternative version of the message',
  tips: 'array of 2-4 short strategic tips for this specific follow-up',
})}
}`,
    };
  },
};
