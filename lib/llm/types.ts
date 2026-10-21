import 'server-only';
import type { z } from 'zod';

export interface LlmProvider {
  readonly name: string; // 'openai' | 'mock'
  embed(
    values: string[],
    opts?: { abortSignal?: AbortSignal },
  ): Promise<{ vectors: number[][]; tokens: number }>;
  streamText(args: {
    model: 'chat';
    system: string;
    prompt: string;
    maxOutputTokens: number;
    abortSignal?: AbortSignal;
  }): {
    textStream: AsyncIterable<string>;
    usage: Promise<{ inputTokens: number; outputTokens: number }>;
  };
  generateObject<T>(args: {
    model: 'chat' | 'judge';
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    maxOutputTokens: number;
    abortSignal?: AbortSignal;
  }): Promise<{ object: T; usage: { inputTokens: number; outputTokens: number } }>;
}
