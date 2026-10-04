import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { Llm7Provider } from './providers/llm7.provider';
import { NebiusProvider } from './providers/nebius.provider';
import { ProviderChainService } from './providers/provider-chain.service';
import { IntentRouterService } from './workflows/intent-router.service';
import { WorkflowRegistry } from './workflows/workflow-registry';
import { UsageModule } from '../usage/usage.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [UsageModule, BillingModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    GeminiProvider,
    OpenAIProvider,
    AnthropicProvider,
    Llm7Provider,
    NebiusProvider,
    ProviderChainService,
    IntentRouterService,
    WorkflowRegistry,
  ],
})
export class AgentModule {}
