export type ProviderName = 'gemini' | 'openai' | 'anthropic';

export interface AiCompletionRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Preserved across provider attempts for OpenCode Go session routing. */
  sessionId?: string;
}

export interface AiCompletionResult {
  text: string;
  provider: ProviderName;
  model: string;
}

export interface AIProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  defaultModel(): string;
  generate(request: AiCompletionRequest): Promise<AiCompletionResult>;
}
