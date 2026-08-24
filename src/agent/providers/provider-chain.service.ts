import { Injectable, Logger } from '@nestjs/common';
import {
  AIProvider,
  AiCompletionRequest,
  AiCompletionResult,
  ProviderName,
} from './ai-provider.interface';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { AllProvidersFailedException } from '../../common/http-exceptions';

export const MAX_PROVIDER_ATTEMPTS = 3;

/** Maps user-facing AI preference to a provider name. */
const PREFERENCE_MAP: Record<string, ProviderName> = {
  google: 'gemini',
  openai: 'openai',
  anthropic: 'anthropic',
};

@Injectable()
export class ProviderChainService {
  private readonly logger = new Logger(ProviderChainService.name);

  constructor(
    private readonly gemini: GeminiProvider,
    private readonly openai: OpenAIProvider,
    private readonly anthropic: AnthropicProvider,
  ) {}

  /** Configured providers in default priority order (Gemini first). */
  available(): AIProvider[] {
    return [this.gemini, this.openai, this.anthropic].filter((p) => p.isConfigured());
  }

  /** Ordered chain honoring the user's preference, capped at MAX_PROVIDER_ATTEMPTS. */
  chainFor(preference: string | undefined | null): AIProvider[] {
    const all = this.available();
    const preferredName = preference ? PREFERENCE_MAP[preference] : undefined;
    if (!preferredName) return all.slice(0, MAX_PROVIDER_ATTEMPTS);

    const preferred = all.find((p) => p.name === preferredName);
    const rest = all.filter((p) => p.name !== preferredName);
    return (preferred ? [preferred, ...rest] : all).slice(0, MAX_PROVIDER_ATTEMPTS);
  }

  /**
   * Runs the request through the chain with a bounded number of attempts.
   * Never retries indefinitely; each provider gets exactly one attempt.
   */
  async generateWithFallback(
    request: AiCompletionRequest,
    preference?: string | null,
    onAttempt?: (provider: ProviderName) => void,
  ): Promise<AiCompletionResult> {
    const chain = this.chainFor(preference);
    if (chain.length === 0) {
      throw new AllProvidersFailedException(
        'No AI provider is configured on the server. Set GEMINI_API_KEY, OPENAI_API_KEY or ANTHROPIC_API_KEY.',
      );
    }

    let lastError: unknown;
    for (const provider of chain) {
      try {
        onAttempt?.(provider.name);
        return await provider.generate(request);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Provider ${provider.name} failed: ${message}`);
      }
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new AllProvidersFailedException(detail.slice(0, 300));
  }
}
