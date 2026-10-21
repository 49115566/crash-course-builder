import type { AiPrompt } from '@ccb/contracts';

export type { AiPrompt } from '@ccb/contracts';

export interface AiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AiChunk {
  text: string;
  usage?: AiUsage;
  finishReason?: string;
}

export interface OutlineInput {
  prompt: AiPrompt;
}

export interface SectionInput {
  prompt: AiPrompt;
  sectionNumber: number;
  sectionTitle: string;
}

export interface AiProvider {
  streamOutline(input: OutlineInput, signal: AbortSignal): AsyncIterable<AiChunk>;
  streamSection(input: SectionInput, signal: AbortSignal): AsyncIterable<AiChunk>;
}
