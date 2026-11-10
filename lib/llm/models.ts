import 'server-only';

export type ModelCapabilities = {
  supportsTemperature: boolean;
  reasoning: boolean;
  embedDimensions?: readonly number[];
  maxOutputTokens?: number;
};
const dimensions = (min: number, max: number) =>
  Array.from({ length: max - min + 1 }, (_, index) => min + index);

export const MODELS: Readonly<Record<string, ModelCapabilities>> = {
  'openai:text-embedding-3-small': {
    supportsTemperature: false,
    reasoning: false,
    embedDimensions: dimensions(1, 1536),
  },
  'openai:text-embedding-3-large': {
    supportsTemperature: false,
    reasoning: false,
    embedDimensions: dimensions(1, 3072),
  },
  'gemini:gemini-embedding-2': {
    supportsTemperature: false,
    reasoning: false,
    embedDimensions: dimensions(128, 3072),
  },
  'gemini:gemini-embedding-001': {
    supportsTemperature: false,
    reasoning: false,
    embedDimensions: dimensions(128, 3072),
  },
  'openai:gpt-6-luna': { supportsTemperature: true, reasoning: true },
  'openai:gpt-5.4': { supportsTemperature: true, reasoning: true },
};

export function modelCapabilities(provider: string, model: string): ModelCapabilities {
  return MODELS[`${provider}:${model}`] ?? { supportsTemperature: true, reasoning: false };
}
