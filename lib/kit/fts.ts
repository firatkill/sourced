const FTS: Readonly<Record<string, string>> = {
  en: 'english',
  de: 'german',
  fr: 'french',
  es: 'spanish',
  it: 'italian',
  pt: 'portuguese',
  nl: 'dutch',
  tr: 'turkish',
  ru: 'russian',
  sv: 'swedish',
  da: 'danish',
  no: 'norwegian',
  fi: 'finnish',
  hu: 'hungarian',
  ro: 'romanian',
};
export function ftsConfig(language: string): string {
  return FTS[language] ?? 'simple';
}
