// Throwaway: checks the eval.yml pull_request path filter (TC-130). Not for merge.
export type SourcePassage = {
  documentTitle: string;
  headingPath: readonly string[];
  content: string;
};
export type PassageId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
export type NumberedPassage = { id: PassageId; content: string };

export function sanitize(text: string): string {
  // D-75: remove controls before replacing delimiters, so removal cannot create one.
  const withoutControls = Array.from(text)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || (code >= 32 && code !== 127);
    })
    .join('');
  return withoutControls.replaceAll('<<<', '‹‹‹').replaceAll('>>>', '›››');
}

export function sanitizeQuestion(question: string): string {
  return sanitize(question).replace(/\s+/g, ' ').trim();
}

export function sourceLabel(passage: SourcePassage): string {
  return [passage.documentTitle, ...passage.headingPath.slice(1)].map(sanitize).join(' › ');
}

export function renderPassages(passages: readonly NumberedPassage[]): string {
  return passages
    .map(({ id, content }) => `<<<PASSAGE ${id}\n${sanitize(content)}\nPASSAGE ${id}>>>`)
    .join('\n\n');
}
