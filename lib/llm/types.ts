import 'server-only';
import type { z } from 'zod';

export type Role = 'chat' | 'rerank' | 'judge' | 'generate' | 'embed';

export interface LlmProvider {
  readonly name: 'openai' | 'gemini' | 'anthropic' | 'ollama' | 'mock';
  embed(
    values: string[],
    opts?: { abortSignal?: AbortSignal },
  ): Promise<{ vectors: number[][]; tokens: number }>;
  streamText(args: {
    model: Role;
    system: string;
    prompt: string;
    maxOutputTokens: number;
    abortSignal?: AbortSignal;
  }): {
    textStream: AsyncIterable<string>;
    usage: Promise<{ inputTokens: number; outputTokens: number }>;
  };
  generateObject<T>(args: {
    model: Role;
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    maxOutputTokens: number;
    abortSignal?: AbortSignal;
  }): Promise<{ object: T; usage: { inputTokens: number; outputTokens: number } }>;
}
