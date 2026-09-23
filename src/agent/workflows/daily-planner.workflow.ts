import { z } from 'zod';
import { WorkflowDefinition, jsonShape, renderUserInput, BASE_SYSTEM } from './types';

/**
 * The mobile app renders each top-level key as a heading and each value as
 * PLAIN TEXT inside a narrow card (see app/workflow/[id].tsx + src/lib/format-result.ts):
 * arrays of objects become one wrapped "• Key: value · Key: value" paragraph and
 * there is NO markdown support. So field order here IS the on-screen order, and
 * long prose turns the result card into an unreadable wall.
 * Keep values terse and the schema order deliberate.
 */

/** Longest we let any single string get before it stops being readable on a phone. */
const MAX_CHARS = 180;

/** Trim, collapse whitespace, strip markdown the app cannot render, hard-cap length. */
const terse = (max = MAX_CHARS) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .transform((s) => s.replace(/\*\*/g, '').replace(/^#{1,6}\s*/, '').replace(/^[•*-]\s+/, ''))
    .transform((s) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s));

/** Keep list rendering short: cap item count instead of rejecting the model's output. */
const capped = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z
    .array(item)
    .min(1)
    .transform((items) => items.slice(0, max));

export const dailyPlannerSchema = z.object({
  // Most actionable line first — it is what the user should read on opening the card.
  first_action: terse(160),
  priority_order: capped(
    z.object({
      task: terse(90),
      priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
      estimated_hours: z.number().positive().max(12).optional().nullable(),
      reason: terse(110).optional().nullable(),
    }),
    5,
  ),
  schedule_blocks: capped(
    z.object({
      time_block: terse(24),
      focus: terse(90),
    }),
    6,
  ),
  focus_sessions: z.number().int().positive().max(12).default(4),
  deadline_warnings: z.array(terse(140)).max(3).default([]),
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
      system: [
        BASE_SYSTEM,
        '',
        'You are a pragmatic productivity planner. Build schedules that fit realistically inside the available hours, respect stated constraints, front-load high-impact work, and warn about deadlines at risk. Never exceed the total available time.',
        '',
        'DISPLAY RULES — the result is shown as plain text in a narrow phone card. There is no markdown rendering and no room for prose:',
        '- Each string is printed verbatim on one bullet line that wraps at roughly 40 characters. Be terse.',
        '- "task": max 8 words. "reason": max 10 words, one clause — no full sentences, no second sentence, no restated justification.',
        '- "focus": max 10 words. "deadline_warnings": max 15 words each. "first_action": max 20 words.',
        '- Never use markdown, asterisks, hashes or emoji inside string values.',
        '- VOLUME: priority_order max 5 items (merge related work into one task line). schedule_blocks max 5 blocks, and NEVER emit breaks, lunch, buffer, overflow or "plan tomorrow" filler — real work only. deadline_warnings max 3, only deadlines genuinely at risk.',
      ].join('\n'),
      user: `Plan my work day.

${renderUserInput(input)}

Return JSON with exactly this shape, in this key order:
{
${jsonShape({
  first_action: 'the single best thing to start with right now, max 20 words',
  priority_order: 'array of objects (max 5): {"task": max 8 words, "priority": "critical"|"high"|"medium"|"low", "estimated_hours": number|null, "reason": max 10 words, one clause}',
  schedule_blocks: 'array of objects (max 5): {"time_block": e.g. "09:00–10:30", "focus": max 10 words}',
  focus_sessions: 'integer count of recommended deep-focus sessions',
  deadline_warnings: 'array of short warnings (max 3, max 15 words each) for deadlines at risk given the available time',
})}
}`,
    };
  },
};
