import { Injectable, Logger } from '@nestjs/common';
import { AIProvider, AiCompletionRequest, AiCompletionResult, ProviderName } from './ai-provider.interface';

/**
 * Nebius AI Studio — paid provider, routed to Pro users FIRST (cheapest quality
 * option: GLM-5.3-Flash at ~$0.15/$0.50 per 1M tokens). Free users never touch
 * this provider: the chain omits it for non-pro runs so spend stays bounded.
 *
 * Spend guard: the daily cron asserts no `nebius`-provider runs exist for
 * non-pro users and reports estimated spend from run history.
 */
const BASE_URL = 'https://api.studio.nebius.com/v1';
const DEFAULT_MODEL = 'zai-org/GLM-5.3-Flash';

@Injectable()
export class NebiusProvider implements AIProvider {
  readonly name: ProviderName = 'nebius';
  private readonly logger = new Logger(NebiusProvider.name);

  isConfigured(): boolean {
    return Boolean(process.env.NEBIUS_API_KEY);
  }

  defaultModel(): string {
    return process.env.NEBIUS_MODEL || DEFAULT_MODEL;
  }

  async generate(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const apiKey = process.env.NEBIUS_API_KEY;
    if (!apiKey) throw new Error('NEBIUS_API_KEY is not configured');

    const model = this.defaultModel();
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: request.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Nebius API error ${response.status}: ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('Nebius returned an empty completion');
    this.logger.log(`Nebius completion ok (${model}, ${text.length} chars)`);
    return { text, provider: this.name, model };
  }
}
