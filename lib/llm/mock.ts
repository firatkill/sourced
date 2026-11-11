import { getCopy } from '@/lib/kit/copy';
import { getKitConfig } from '@/lib/kit/runtime-config';
import 'server-only';
import { GENERATION, RETRIEVAL } from '@/lib/config';
import { getEnv } from '@/lib/env';
import { AppError, PROVIDER_ERROR_MESSAGE, PROVIDER_TIMEOUT_MESSAGE } from '@/lib/errors';
import { sentences } from '@/lib/ingest/chunk';
import { countTokens } from '@/lib/ingest/tokenizer';
import { featureHash } from './feature-hash';
import type { LlmProvider } from './types';

/** Only the mock-mode route may handle this as a deliberate connection drop. */
export class MockDropSignal extends Error {
  constructor() {
    super('Mock stream dropped.');
    this.name = 'MockDropSignal';
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AppError('PROVIDER_TIMEOUT', PROVIDER_TIMEOUT_MESSAGE));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function passagesFrom(prompt: string) {
  return Array.from(
    prompt.matchAll(/<<<PASSAGE (P[1-9])\r?\n([\s\S]*?)\r?\nPASSAGE \1>>>/g),
    (match) => ({
      id: match[1] ?? '',
      content: (match[2] ?? '').replace(/^Source: [^\n]*\n/, '').trim(),
    }),
  );
}

function firstSentence(content: string): string {
  return (
    sentences(content)
      .find((sentence) => sentence.trim().split(/\s+/).length >= 6)
      ?.trim() ?? content.trim().split(/\s+/).slice(0, 12).join(' ')
  );
}

function quote(content: string): string {
  return firstSentence(content).split(/\s+/).slice(0, 12).join(' ');
}

function scriptFor(prompt: string) {
  const question =
    /<<<QUESTION\r?\n([\s\S]*?)\r?\nQUESTION>>>/.exec(prompt)?.[1]?.toLowerCase() ?? '';
  const triggers = [
    'provider-error',
    'error-midstream',
    'drop',
    'slow',
    'not-found',
    'invalid-citation',
    'no-block',
    'echo-injection',
  ];
  const trigger = triggers.find((name) => question.includes(`mock:${name}`));
  const passages = passagesFrom(prompt);
  if (trigger === 'not-found') {
    return {
      trigger,
      text: getCopy(getKitConfig()).notFound + GENERATION.CITATIONS_DELIMITER + '{"citations":[]}',
    };
  }
  if (trigger === 'echo-injection') {
    return {
      trigger,
      text: passages
        .slice(0, getKitConfig().overrides.retrieval.finalPassages ?? RETRIEVAL.FINAL_PASSAGES)
        .map((p) => p.content)
        .join('\n'),
    };
  }
  const selected = passages.filter((p) => p.id === 'P1' || p.id === 'P2');
  let answer =
    'According to the documentation, ' +
    selected.map((p) => `${firstSentence(p.content).replace(/\.$/, '')} [${p.id}].`).join(' ');
  const citations = selected.map((p) => ({
    id: p.id,
    quote: quote(firstSentence(p.content).replace(/\.$/, '')),
  }));
  if (trigger === 'invalid-citation') {
    answer += ' This claim has no supporting quote [P3]. This claim cites an unknown passage [P9].';
    citations.push(
      { id: 'P3', quote: 'this text does not appear anywhere' },
      { id: 'P9', quote: 'this passage does not exist anywhere' },
    );
  }
  return {
    trigger,
    text:
      trigger === 'no-block'
        ? answer
        : `${answer}\n${GENERATION.CITATIONS_DELIMITER}\n${JSON.stringify({ citations })}`,
  };
}

export const mockProvider: LlmProvider = {
  name: 'mock',
  embed(values, opts) {
    opts?.abortSignal?.throwIfAborted();
    const results = values.map((value) => featureHash(value));
    return Promise.resolve({
      vectors: results.map((result) => result.vector),
      tokens: results.reduce((sum, result) => sum + result.tokens, 0),
    });
  },
  streamText(args) {
    const { text, trigger } = scriptFor(args.prompt);
    const interval = trigger === 'slow' ? 250 : getEnv().MOCK_STREAM_DELAY_MS;
    return {
      usage: Promise.resolve({
        inputTokens: countTokens(args.system + args.prompt),
        outputTokens: countTokens(text),
      }),
      textStream: (async function* () {
        try {
          args.abortSignal?.throwIfAborted();
          if (trigger === 'provider-error')
            throw new AppError('PROVIDER_ERROR', PROVIDER_ERROR_MESSAGE);
          for (let offset = 0; offset < text.length; offset += 8) {
            if (offset === 24) {
              if (trigger === 'error-midstream')
                throw new AppError('PROVIDER_ERROR', PROVIDER_ERROR_MESSAGE);
              if (trigger === 'drop') throw new MockDropSignal();
            }
            await delay(interval, args.abortSignal);
            yield text.slice(offset, offset + 8);
          }
        } catch (error) {
          if (args.abortSignal?.aborted)
            throw new AppError('PROVIDER_TIMEOUT', PROVIDER_TIMEOUT_MESSAGE);
          throw error;
        }
      })(),
    };
  },
  generateObject(args) {
    args.abortSignal?.throwIfAborted();
    let output: unknown;
    if (args.model === 'generate') {
      const anchor = /^Anchor: (.+)$/m.exec(args.prompt)?.[1];
      output = anchor
        ? {
            question: 'How does the documented feature work in practice?',
            reference_answer:
              /^Content:\n([\s\S]*?)\nTARGET>>>/m
                .exec(args.prompt)?.[1]
                ?.trim()
                .split(/\s+/)
                .slice(0, 80)
                .join(' ') ?? '',
            expected_anchors: [anchor],
          }
        : { questions: ['What are the subscription fees for this service?'] };
    } else if (args.model === 'judge') {
      output = { score: 1, unsupported_claims: [], rationale: 'mock' };
    } else if (/^Cited ids:/m.test(args.prompt)) {
      const ids =
        /^Cited ids: (.*)$/m
          .exec(args.prompt)?.[1]
          ?.split(',')
          .map((id) => id.trim()) ?? [];
      const passages = passagesFrom(args.prompt);
      output = {
        citations: ids.map((id) => ({
          id,
          quote: quote(passages.find((p) => p.id === id)?.content ?? ''),
        })),
      };
    } else {
      output = { ranking: Array.from(args.prompt.matchAll(/^\[(R\d+)\] /gm), (match) => match[1]) };
    }
    const object = args.schema.parse(output);
    return Promise.resolve({
      object,
      usage: {
        inputTokens: countTokens(args.system + args.prompt),
        outputTokens: countTokens(JSON.stringify(object)),
      },
    });
  },
};

export function createMockProvider(dimensions: number): LlmProvider {
  return {
    ...mockProvider,
    embed(values, opts) {
      opts?.abortSignal?.throwIfAborted();
      const results = values.map((value) => featureHash(value, dimensions));
      return Promise.resolve({
        vectors: results.map((r) => r.vector),
        tokens: results.reduce((sum, r) => sum + r.tokens, 0),
      });
    },
  };
}
