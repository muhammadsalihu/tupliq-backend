/**
 * AI provider abstraction for Tupliq Agent.
 *
 * Providers are tried in priority order (Gemini → OpenAI → Anthropic) based on
 * which API keys are configured on the server. Keys NEVER leave the backend.
 */

export type ProviderId = 'google' | 'openai' | 'anthropic';

export interface AgentInput {
  systemPrompt: string;
  userPrompt: string;
  /** Zod-style JSON schema describing the expected structured output. */
  jsonSchema: Record<string, unknown>;
  /** Preferred provider when the user picked a specific one ('auto' = undefined). */
  preferredProvider?: ProviderId;
}

export interface AgentResponse {
  provider: ProviderId;
  model: string;
  /** Parsed structured output (already validated against the workflow schema). */
  data: unknown;
  durationMs: number;
}

export interface AIProvider {
  readonly id: ProviderId;
  isConfigured(): boolean;
  defaultModel(): string;
  generate(input: AgentInput): Promise<AgentResponse>;
}
