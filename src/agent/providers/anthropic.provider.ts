import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider, AiCompletionRequest, AiCompletionResult } from './ai-provider.interface';

const DEFAULT_MODEL = 'claude-3-5-haiku-latest';
const BASE_URL = 'https://api.anthropic.com/v1/messages';

@Injectable()
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic' as const;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('ANTHROPIC_API_KEY'));
  }

  defaultModel(): string {
    return this.config.get<string>('AI_MODEL_ANTHROPIC', DEFAULT_MODEL);
  }

  async generate(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

    const model = this.defaultModel();
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      signal: request.signal,
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
        system: `${request.system}\nRespond with a single valid JSON value and nothing else.`,
        messages: [{ role: 'user', content: request.user }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.map((block) => (block.type === 'text' ? block.text ?? '' : '')).join('');
    if (!text) throw new Error('Anthropic returned an empty response');
    return { text, provider: this.name, model };
  }
}
