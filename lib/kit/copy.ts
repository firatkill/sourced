import { RETRIEVAL } from '@/lib/config';
import type { KitConfig } from './config-schema';

/**
 * Pure renderer shared by the snapshot writer and server-side prompt builders (UT-33).
 * D-140 / REDESIGN-v2 §3: a corpus without its own copy gets fixed generic copy. UI strings
 * never interpolate `corpus.title` or `corpus.description`; prompts may (promptSubject).
 */
const GENERIC_NOT_FOUND = "I couldn't find this in your documents.";

export function getCopy(
  config: Pick<KitConfig, 'corpus' | 'copy'> & {
    overrides: Pick<KitConfig['overrides'], 'retrieval'>;
  },
  documentCount: number | string = '{documentCount}',
) {
  const { corpus, copy } = config;
  const promptSubject = copy.promptSubject ?? corpus.title;
  const rerankSubject = copy.rerankSubject ?? promptSubject;
  const fillCount = (text: string) => text.replaceAll('{documentCount}', String(documentCount));
  const count = config.overrides.retrieval.finalPassages ?? RETRIEVAL.FINAL_PASSAGES;
  const [, pageCount, pagesSubject] = /^(\d+) pages of the (.+)$/.exec(corpus.description) ?? [];
  const pagesOf = pageCount && pagesSubject ? { count: pageCount, subject: pagesSubject } : null;
  const labels = Array.from({ length: count }, (_, index) => `[P${String(index + 1)}]`);
  const citationMarkers =
    count === 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} or ${labels.at(-1) ?? ''}`;
  return {
    citationMarkers,
    documentTitle: copy.documentTitle ?? 'Sourced',
    hero: copy.hero ?? 'What do you want to know?',
    lead:
      copy.lead ??
      'Answers come only from your documents. Every claim links to the passage it came from, checked before you see it.',
    notFound: copy.notFound ?? GENERIC_NOT_FOUND,
    notFoundHeading: (copy.notFound ?? GENERIC_NOT_FOUND).replaceAll("'", '’'),
    notFoundBody: fillCount(
      copy.notFoundBody ??
        'Sourced only answers from the {documentCount} documents it has indexed. These passages came closest:',
    ),
    docsLink: corpus.linkLabel,
    ...(corpus.attribution === undefined ? {} : { attribution: corpus.attribution }),
    ...(copy.license === undefined ? {} : { license: copy.license }),
    railSubtitle: copy.shortTitle ?? 'Your documents',
    headerScope: copy.headerScope ?? 'Answers only from your documents',
    scope:
      copy.scope ??
      'Answers come only from your documents. If the answer is not there, Sourced says so.',
    placeholder: copy.placeholder ?? 'Ask about your documents',
    nextPlaceholder: copy.nextPlaceholder ?? 'Ask a follow-up',
    searched: fillCount(copy.searched ?? 'Searched {documentCount} documents'),
    viewerLink: copy.viewerLink ?? 'Open the source',
    ...(copy.sourceDomain === undefined ? {} : { docsDomain: copy.sourceDomain }),
    promptSubject,
    rerankSubject,
    // /how-it-works: the example's count-first description reads "The 35 … pages are parsed";
    // any other corpus reads "Your documents are parsed" and has no corpus-size limit line.
    preparationSubject: pagesOf
      ? `The ${pagesOf.count} ${pagesOf.subject} pages`
      : 'Your documents',
    ...(pagesOf
      ? {
          corpusLimit: `The corpus is ${pagesOf.count} pages, not the full ${rerankSubject} documentation.`,
        }
      : {}),
    ...(copy.exampleNotice === undefined ? {} : { exampleNotice: copy.exampleNotice }),
    suggested: copy.suggested.map(({ id, text, topic }) => ({
      id,
      question: text,
      ...(topic === undefined ? {} : { topic }),
    })),
  };
}
export type CorpusCopy = ReturnType<typeof getCopy>;
/** What the browser receives: prompt-only fields may name the corpus, so they stay on the server. */
export type UiCopy = Omit<CorpusCopy, 'promptSubject' | 'rerankSubject'>;
export function uiCopy(copy: CorpusCopy): UiCopy {
  const ui: Partial<CorpusCopy> = { ...copy };
  delete ui.promptSubject;
  delete ui.rerankSubject;
  return ui as UiCopy;
}
