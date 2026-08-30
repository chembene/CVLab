import { Injectable } from '@nestjs/common';
import type { AIProvider } from '../interfaces/ai-provider.interface';

/**
 * In-memory registry of every AIProvider the orchestration layer can select
 * from — keyed by AIProvider.name. AiOrchestrationModule registers
 * DummyAIProvider on boot; a future provider (OpenAI, Anthropic, Gemini)
 * registers itself the same way, without ProviderSelector/ModelSelector or
 * AiOrchestrationService ever importing it directly.
 */
@Injectable()
export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  list(): AIProvider[] {
    return Array.from(this.providers.values());
  }
}
