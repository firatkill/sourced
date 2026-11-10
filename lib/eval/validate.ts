import { loadConfig } from '@/lib/kit/load-config';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { AppError } from '@/lib/errors';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { load } from 'cheerio';
import { closeSqlForTests, getSql } from '@/lib/db/client';
import { loadManifest } from '@/lib/ingest/manifest';
import { parseHtml, type Section } from '@/lib/ingest/parse-html';
import {
  PASSAGE_INJECTION_QUESTION,
  formatGoldenDistribution,
  missingGoldenAnchors,
  parseGolden,
  validateGolden,
  validateGoldenEntries,
  type GoldenCorpus,
} from '@/lib/eval/golden';

export async function readGoldenCorpus(): Promise<GoldenCorpus> {
  const manifest = await loadManifest();
  const headings: string[] = [];
  const identifiers = new Set<string>();
  const collect = (section: Section) => {
    headings.push(section.heading);
    for (const child of section.children) collect(child);
  };
  for (const page of [...manifest.pages, ...manifest.fixtures]) {
    if (!page.path) throw new AppError('VALIDATION_FAILED', 'Missing raw cache path.');
    const html = await readFile(page.path, 'utf8');
    collect(
      parseHtml(html, {
        ...page,
        html: {
          preset: 'postgres-docbook' as const,
          contentSelector: manifest.contentSelector,
          removeSelectors: manifest.removeSelectors,
        },
      }).root,
    );
    const $ = load(html);
    for (const selector of manifest.removeSelectors) $(selector).remove();
    $(manifest.contentSelector)
      .find('.command, .function, .application, .varname, .literal')
      .each((_, node) => {
        const identifier = $(node).text().replace(/\s+/g, ' ').trim();
        // Literal markup also wraps prose and sample values. Count SQL commands,
        // functions, utilities, and named underscore identifiers conservatively.
        if (
          identifier &&
          /[A-Za-z]/.test(identifier) &&
          ($(node).is('.command, .function, .application') ||
            /^[a-zA-Z][a-zA-Z0-9]*_[a-zA-Z0-9_]+$/.test(identifier))
        )
          identifiers.add(identifier);
      });
  }
  return { headings, identifiers: [...identifiers] };
}

// IT-11 uses a subset to exercise the same schema and database checks as the full CLI.
// Only whole-set composition checks are omitted in this explicitly selected mode.
export async function runGoldenValidation(options: {
  text: string;
  corpus: GoldenCorpus;
  subset?: boolean;
  write: (message: string) => void;
}): Promise<number> {
  const { entries, errors } = parseGolden(options.text);
  errors.push(
    ...(options.subset
      ? validateGoldenEntries(entries, options.corpus)
      : validateGolden(entries, options.corpus)),
  );
  if (entries.length === 0) errors.push('Golden set must not be empty.');
  const rows = await getSql()<{ anchor: string }[]>`SELECT DISTINCT anchor FROM chunks`;
  for (const anchor of missingGoldenAnchors(
    entries,
    rows.map((row) => row.anchor),
  )) {
    errors.push(`Missing anchor: ${anchor}`);
  }
  if (
    entries.some(
      (entry) => entry.type === 'injection' && entry.question === PASSAGE_INJECTION_QUESTION,
    ) &&
    !rows.some((row) => row.anchor === 'injected-notice.html#INJECTED-NOTICE')
  )
    errors.push(
      'Missing passage-borne fixture: injected-notice.html#INJECTED-NOTICE. Run pnpm ingest --include-fixtures first.',
    );
  options.write(formatGoldenDistribution(entries, options.corpus));
  for (const error of errors) options.write(error);
  if (errors.length === 0) options.write(`Validated ${String(entries.length)} golden entries.`);
  return errors.length === 0 ? 0 : 1;
}

export async function runEvalValidation(
  args: string[] = [],
  write: (message: string) => void = (message) => {
    process.stdout.write(`${message}\n`);
  },
): Promise<number> {
  await loadConfig();
  const { values } = parseArgs({
    args,
    options: {
      file: { type: 'string', default: `eval/${getKitConfig().corpus.name}/golden.jsonl` },
      subset: { type: 'boolean', default: false },
    },
  });
  try {
    return await runGoldenValidation({
      text: await readFile(values.file, 'utf8'),
      corpus: await readGoldenCorpus(),
      subset: values.subset,
      write,
    });
  } finally {
    await closeSqlForTests();
  }
}
