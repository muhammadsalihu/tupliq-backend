import { z } from 'zod';

export type WorkflowFieldType = 'text' | 'textarea' | 'select' | 'number';

export interface WorkflowFieldDef {
  name: string;
  label: string;
  type: WorkflowFieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface PromptContext {
  userName?: string | null;
  role?: string | null;
}

export interface BuiltPrompts {
  system: string;
  user: string;
}

export interface WorkflowDefinition {
  key: string;
  name: string;
  tagline: string;
  /** Icon key resolved by the mobile app (Ionicons name). */
  icon: string;
  /** Pro-only workflows require an active Pro entitlement server-side. */
  premium: boolean;
  fields: WorkflowFieldDef[];
  schema: z.ZodTypeAny;
  buildPrompts(input: Record<string, string>, ctx: PromptContext): BuiltPrompts;
}

const BASE_SYSTEM = [
  'You are Tupliq Agent, a professional AI operations assistant used by remote workers, freelancers, consultants and small businesses.',
  'You produce practical, specific, ready-to-use professional work products — never filler or generic advice.',
  'Personalise outputs using the provided context when available.',
  'CRITICAL OUTPUT RULES:',
  '- Respond with exactly one JSON object and nothing else.',
  '- Do not wrap the JSON in markdown fences or commentary.',
  '- Every field described must be present; use "" or [] only when truly impossible to fill.',
].join('\n');

/** Renders the expected JSON shape from a zod schema description for prompts. */
export function jsonShape(shape: Record<string, string>): string {
  return Object.entries(shape)
    .map(([key, type]) => `  "${key}": ${type}`)
    .join(',\n');
}

export function renderUserInput(input: Record<string, string>): string {
  return Object.entries(input)
    .filter(([, value]) => value && value.trim().length > 0)
    .map(([key, value]) => `### ${labelize(key)}\n${value.trim()}`)
    .join('\n\n');
}

function labelize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
