import { z } from 'zod';
import { WorkflowDefinition, jsonShape, renderUserInput, BASE_SYSTEM } from './types';

export const meetingToTasksSchema = z.object({
  summary: z.string().min(1),
  decisions: z.array(z.string()).default([]),
  action_items: z
    .array(
      z.object({
        task: z.string().min(1),
        owner: z.string().optional().nullable(),
        deadline: z.string().optional().nullable(),
        priority: z.enum(['high', 'medium', 'low']).default('medium'),
      }),
    )
    .default([]),
  risks: z.array(z.string()).default([]),
  next_steps: z.array(z.string()).default([]),
});

export const meetingToTasksWorkflow: WorkflowDefinition = {
  key: 'meeting_to_tasks',
  name: 'Meeting to Tasks',
  tagline: 'Notes and transcripts in — decisions, owners and action items out.',
  icon: 'list-outline',
  premium: false,
  fields: [
    { name: 'meeting_notes', label: 'Meeting notes or transcript', type: 'textarea', required: true, placeholder: 'Paste raw notes, transcript or voice memo text…' },
    { name: 'meeting_context', label: 'Meeting context (optional)', type: 'text', required: false, placeholder: 'Weekly client sync / sprint planning…' },
    { name: 'attendees', label: 'Attendees (optional)', type: 'text', required: false, placeholder: 'Sarah (client), John (dev), me' },
  ],
  schema: meetingToTasksSchema,
  buildPrompts(input) {
    return {
      system: `${BASE_SYSTEM}\n\nYou convert messy meeting notes into precise, actionable structure. Only assign owners and deadlines that are actually present in the notes — never invent them. Distinguish clearly between what was decided and what is merely suggested.`,
      user: `Convert this meeting into structured output.

${renderUserInput(input)}

Return JSON with exactly this shape:
{
${jsonShape({
  summary: 'concise paragraph summarising the meeting',
  decisions: 'array of decisions made',
  action_items: 'array of objects: {"task": string, "owner": string|null (only if stated), "deadline": string|null (only if stated), "priority": "high"|"medium"|"low"}',
  risks: 'array of risks, blockers or concerns raised',
  next_steps: 'array of immediate next steps',
})}
}`,
    };
  },
};
