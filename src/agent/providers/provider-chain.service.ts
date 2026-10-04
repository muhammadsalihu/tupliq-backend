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
import { Llm7Provider } from './llm7.provider';
import { NebiusProvider } from './nebius.provider';
import { AllProvidersFailedException } from '../../common/http-exceptions';

export const MAX_PROVIDER_ATTEMPTS = 4;

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
    private readonly llm7: Llm7Provider,
    private readonly nebius: NebiusProvider,
  ) {}

  /** Configured providers in priority order: Groq (openai-compat) first, Gemini second,
   *  Anthropic third, keyless llm7 last as the never-fail backstop. */
  available(): AIProvider[] {
    return [this.openai, this.gemini, this.anthropic, this.llm7].filter((p) => p.isConfigured());
  }

  /** Free tier: Groq → Gemini → Anthropic → llm7. Pro tier: Nebius (paid, cheap
   *  GLM-5.3-Flash) first, then everything free as fallback so pro runs still succeed. */
  availableForPro(): AIProvider[] {
    const free = this.available();
    return this.nebius.isConfigured() ? [this.nebius, ...free] : free;
  }

  /** Ordered chain honoring the user's preference and tier, capped at MAX_PROVIDER_ATTEMPTS. */
  chainFor(preference: string | undefined | null, isPro = false): AIProvider[] {
    const all = isPro ? this.availableForPro() : this.available();
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
    isPro = false,
    onAttempt?: (provider: ProviderName) => void,
  ): Promise<AiCompletionResult> {
    const chain = this.chainFor(preference, isPro);
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
