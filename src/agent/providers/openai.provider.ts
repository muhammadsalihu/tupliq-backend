import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider, AiCompletionRequest, AiCompletionResult } from './ai-provider.interface';

const DEFAULT_MODEL = 'gpt-4o-mini';
const BASE_URL = 'https://api.openai.com/v1/chat/completions';

@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('OPENAI_API_KEY'));
  }

  defaultModel(): string {
    return this.config.get<string>('AI_MODEL_OPENAI', DEFAULT_MODEL);
  }

  async generate(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

    const model = this.defaultModel();
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
      throw new Error(`OpenAI API error ${response.status}: ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('OpenAI returned an empty response');
    return { text, provider: this.name, model };
  }
}
