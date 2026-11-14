import { RETRIEVAL } from '@/lib/config';
import type { KitConfig } from './config-schema';

/** Pure renderer shared by the snapshot writer and server-side prompt builders (UT-33). */
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
  const labels = Array.from({ length: count }, (_, index) => `[P${String(index + 1)}]`);
  const citationMarkers =
    count === 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} or ${labels.at(-1) ?? ''}`;
  return {
    citationMarkers,
    documentTitle: copy.documentTitle ?? `Sourced: answers from ${corpus.title}`,
    hero: copy.hero ?? `Ask ${corpus.title}. Every claim shows its source.`,
    lead:
      copy.lead ??
      `Answers come only from ${corpus.description}. Each citation is checked against the passage it points to before you see it.`,
    notFound: copy.notFound ?? `I couldn't find this in ${corpus.title}.`,
    notFoundHeading: (copy.notFound ?? `I couldn't find this in ${corpus.title}.`).replaceAll(
      "'",
      '’',
    ),
    notFoundBody: fillCount(
      copy.notFoundBody ??
        'Sourced only answers from the {documentCount} documents it has indexed. These passages came closest:',
    ),
    docsLink: corpus.linkLabel,
    ...(corpus.attribution === undefined ? {} : { attribution: corpus.attribution }),
    ...(copy.license === undefined ? {} : { license: copy.license }),
    railSubtitle: copy.shortTitle ?? corpus.title,
    headerScope: copy.headerScope ?? `Answers only from ${corpus.description}`,
    scope:
      copy.scope ??
      `Answers come only from ${corpus.description}. If the answer is not there, Sourced says so.`,
    placeholder: copy.placeholder ?? `Ask a question about ${corpus.title}`,
    nextPlaceholder: copy.nextPlaceholder ?? `Ask another question about ${corpus.title}`,
    searched: fillCount(copy.searched ?? 'Searched {documentCount} documents'),
    viewerLink: copy.viewerLink ?? 'Open the source',
    ...(copy.sourceDomain === undefined ? {} : { docsDomain: copy.sourceDomain }),
    promptSubject,
    rerankSubject,
    // Reorder the example's count-first description without baking corpus copy into the page.
    preparationSubject: corpus.description.replace(/^(\d+) pages of the (.+)$/, '$1 $2 pages'),
    corpusExtent: corpus.description.replace(/ of the .+$/, ''),
    suggested: copy.suggested.map(({ id, text, topic }) => ({
      id,
      question: text,
      ...(topic === undefined ? {} : { topic }),
    })),
  };
}
export type CorpusCopy = ReturnType<typeof getCopy>;
