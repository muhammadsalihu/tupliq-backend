import { Injectable, Logger } from '@nestjs/common';
import { AIProvider, AiCompletionRequest, AiCompletionResult, ProviderName } from './ai-provider.interface';

/**
 * llm7.io — keyless OpenAI-compatible fallback provider.
 *
 * Zero-config safety net: when Groq (or any keyed provider) is down or out of
 * quota, runs still complete. Requests stay inside llm7's anonymous tier
 * (turbo models, json_object mode supported on DeepSeek-V4-Flash-0731).
 */
const BASE_URL = 'https://api.llm7.io/v1';
const DEFAULT_MODEL = 'DeepSeek-V4-Flash-0731';
/** Anonymous tier never sends a key — a placeholder satisfies the Bearer scheme. */
const DUMMY_BEARER = 'unused';

@Injectable()
export class Llm7Provider implements AIProvider {
  readonly name: ProviderName = 'llm7';
  private readonly logger = new Logger(Llm7Provider.name);

  isConfigured(): boolean {
    return true;
  }

  defaultModel(): string {
    return process.env.LLM7_MODEL || DEFAULT_MODEL;
  }

  async generate(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const model = this.defaultModel();
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DUMMY_BEARER}`,
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
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`llm7 API error ${response.status}: ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) {
      throw new Error('llm7 API returned an empty completion');
    }
    this.logger.log(`llm7 completion ok (${model}, ${text.length} chars)`);
    return { text, provider: this.name, model };
  }
}
