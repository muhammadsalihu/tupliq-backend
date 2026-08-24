import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AgentInput,
  AgentResponse,
  AIProvider,
  ProviderId,
} from './providers/provider.interface';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';

/**
 * Orchestrates provider selection with fallback.
 *
 * Auto mode: try providers in priority order (Gemini → OpenAI → Anthropic),
 * skipping unconfigured ones. A user preference pins the starting provider
 * but still falls back if that provider fails or is not configured.
 */
@Injectable()
export class ProviderRegistry {
  private readonly logger = new Logger(ProviderRegistry.name);
  private readonly providers: AIProvider[];

  constructor(
    private readonly gemini: GeminiProvider,
    private readonly openai: OpenAIProvider,
    private readonly anthropic: AnthropicProvider,
    private readonly config: ConfigService,
  ) {
    this.providers = [this.gemini, this.openai, this.anthropic];
  }

  /** Providers that have API keys configured, in priority order. */
  availableProviders(): ProviderId[] {
    return this.providers.filter((p) => p.isConfigured()).map((p) => p.id);
  }

  async generate(input: AgentInput): Promise<AgentResponse> {
    const available = this.availableProviders();
    if (available.length === 0) {
      throw new Error(
        'No AI provider is configured. Set GOOGLE_AI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.',
      );
    }

    // Build the attempt order: preferred provider first (if configured), then the rest.
    let order: AIProvider[] = this.providers.filter((p) => p.isConfigured());
    if (input.preferredProvider) {
      const preferred = this.providers.find(
        (p) => p.id === input.preferredProvider && p.isConfigured(),
      );
      if (preferred) {
        order = [preferred, ...order.filter((p) => p.id !== preferred.id)];
      }
    }

    let lastError: unknown;
    for (const provider of order) {
      try {
        this.logger.log(`Executing via ${provider.id} (${provider.defaultModel()})`);
        return await provider.generate(input);
      } catch (error: unknown) {
        lastError = error;
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Provider ${provider.id} failed: ${message}. Trying next provider…`);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('All AI providers failed');
  }

  /** Which provider would serve a user preference right now (for UI hints). */
  resolveForPreference(preference: string): ProviderId | null {
    const map: Record<string, ProviderId> = { google: 'google', openai: 'openai', anthropic: 'anthropic' };
    const wanted = map[preference];
    if (wanted && wanted === preference) {
      const provider = this.providers.find((p) => p.id === wanted);
      if (provider?.isConfigured()) return wanted;
    }
    return null;
  }
}
