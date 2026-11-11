import { INSPECT } from '@/lib/config';
// Small, explicit stopword lexicons for the languages with built-in FTS dictionaries.
// Unknown text and tied scores abstain; technical identifiers are not language evidence.
const stopwords: Readonly<Record<string, string>> = {
  en: 'the and is are of to in for with this that a an it as be by from on or not',
  de: 'der die das und ist sind von zu im für mit ein eine nicht auf den dem des',
  fr: 'le la les des et est sont de du un une dans pour avec ce cette sur pas',
  es: 'el la los las y es son de del un una en para con que por se como',
  it: 'il lo la gli le e è sono di del un una per con che non nel della',
  pt: 'o a os as e é são de do da um uma em para com que não por',
  nl: 'de het een en is zijn van in voor met op niet dat dit als aan',
  tr: 've bir bu şu için ile olan olarak gibi daha da de değil ama veya',
  ru: 'и в во не на что это как с со из для по или от его',
  sv: 'och det att en ett är som för med av till inte på den',
  da: 'og det at en et er som for med af til ikke på den',
  no: 'og det at en et er som for med av til ikke på den',
  fi: 'ja on ei se että joka myös ovat kun tai jos niin kuin',
  hu: 'és a az egy hogy nem van is meg ha mint vagy de',
  ro: 'și în de la un o este sunt pentru cu pe din sau nu',
};
const lexicons = Object.entries(stopwords).map(([language, words]) => ({
  language,
  words: new Set(words.split(' ')),
}));
export function detectLanguage(chunks: readonly string[]): string | null {
  // Callers pass a representative sample; this cap also bounds direct use.
  const tokens = chunks.slice(0, INSPECT.SAMPLE_CHUNKS).flatMap(
    (text) =>
      text
        .normalize('NFKC')
        .toLowerCase()
        .match(/\p{L}+/gu) ?? [],
  );
  if (!tokens.length) return null;
  const scores = lexicons
    .map(({ language, words }) => ({
      language,
      ratio: tokens.filter((token) => words.has(token)).length / tokens.length,
    }))
    .sort((a, b) => b.ratio - a.ratio);
  const best = scores[0];
  return best && best.ratio > 0 && best.ratio > (scores[1]?.ratio ?? 0) ? best.language : null;
}
