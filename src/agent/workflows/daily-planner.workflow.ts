import { z } from 'zod';
import { WorkflowDefinition, jsonShape, renderUserInput, BASE_SYSTEM } from './types';

export const dailyPlannerSchema = z.object({
  priority_order: z
    .array(
      z.object({
        task: z.string().min(1),
        priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
        estimated_hours: z.number().positive().max(12).optional().nullable(),
        reason: z.string().optional().nullable(),
      }),
    )
    .min(1),
  schedule_blocks: z
    .array(z.object({ time_block: z.string().min(1), focus: z.string().min(1) }))
    .min(1),
  focus_sessions: z.number().int().positive().max(12).default(4),
  deadline_warnings: z.array(z.string()).default([]),
  first_action: z.string().min(1),
});

export const dailyPlannerWorkflow: WorkflowDefinition = {
  key: 'daily_planner',
  name: 'Daily Work Planner',
  tagline: 'Deadlines and tasks in — a realistic, prioritised plan for the day.',
  icon: 'calendar-outline',
  premium: false,
  fields: [
    { name: 'tasks', label: 'Your tasks', type: 'textarea', required: true, placeholder: 'List everything on your plate…' },
    { name: 'deadlines', label: 'Deadlines (optional)', type: 'textarea', required: false, placeholder: 'Proposal due Friday, invoice by 30th…' },
    { name: 'available_hours', label: 'Available hours today', type: 'text', required: false, placeholder: 'e.g. 6 hours, 9:00–15:00' },
    { name: 'priorities_constraints', label: 'Priorities & constraints (optional)', type: 'textarea', required: false, placeholder: 'Deep work mornings only, client call at 14:00…' },
  ],
  schema: dailyPlannerSchema,
  buildPrompts(input) {
    return {
      system: `${BASE_SYSTEM}\n\nYou are a pragmatic productivity planner. Build schedules that fit realistically inside the available hours, respect stated constraints, front-load high-impact work, and warn about deadlines at risk. Never exceed the total available time.`,
      user: `Plan my work day.

${renderUserInput(input)}

Return JSON with exactly this shape:
{
${jsonShape({
  priority_order: 'array of objects: {"task": string, "priority": "critical"|"high"|"medium"|"low", "estimated_hours": number|null, "reason": string|null}',
  schedule_blocks: 'array of objects: {"time_block": e.g. "09:00–10:30", "focus": what to work on}',
  focus_sessions: 'integer count of recommended deep-focus sessions',
  deadline_warnings: 'array of warnings for any deadline at risk given the available time',
  first_action: 'the single best thing to start with right now and why',
})}
}`,
    };
  },
};
