import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  GoldenEntry,
  goldenDistribution,
  headingOverlap,
  missingGoldenAnchors,
  parseGolden,
  validateGolden,
  type GoldenCorpus,
} from '@/lib/eval/golden';
import { readGoldenCorpus } from '@/scripts/eval-validate';

let text: string;
let entries: GoldenEntry[];
let corpus: GoldenCorpus;
beforeAll(async () => {
  text = await readFile('eval/postgres-17/golden.jsonl', 'utf8');
  entries = parseGolden(text).entries;
  corpus = await readGoldenCorpus();
});

test('TC-113 / UT-25 / FR-40: full golden file meets TRD §17.2 rules 1–5, 7 and reference length', () => {
  expect(parseGolden(text).errors).toEqual([]);
  expect(entries).toHaveLength(40);
  expect(entries.map((entry) => entry.id)).toEqual(
    Array.from({ length: 40 }, (_, i) => `q${String(i + 1).padStart(3, '0')}`),
  );
  expect(validateGolden(entries, corpus)).toEqual([]);
  const distribution = goldenDistribution(entries, corpus);
  expect(distribution.types).toEqual({ answerable: 32, unanswerable: 5, injection: 3 });
  expect(distribution.chapters).toEqual({
    indexes: 7,
    concurrency: 5,
    performance: 5,
    'full-text-search': 4,
    json: 3,
    maintenance: 3,
    backup: 3,
    'row-level-security': 2,
  });
  expect(distribution.multiAnchor).toBeGreaterThanOrEqual(6);
  expect(distribution.exactIdentifier).toBeGreaterThanOrEqual(6);
  expect(distribution.paraphrase).toBeGreaterThanOrEqual(6);
  expect(distribution.nearDomain).toBeGreaterThanOrEqual(3);
  expect(distribution.offDomain).toBeGreaterThanOrEqual(1);
  for (const entry of entries) {
    expect(entry.question.trim().split(/\s+/).length).toBeGreaterThanOrEqual(6);
    expect(entry.question.trim().split(/\s+/).length).toBeLessThanOrEqual(25);
    expect(entry.reference_answer.trim().split(/\s+/).length).toBeLessThanOrEqual(80);
    if (entry.type === 'unanswerable') expect(entry.notes).toContain('grep -il terms:');
  }
});

describe('TC-114 / UT-25 / FR-40: normative GoldenEntry boundary', () => {
  test.each([
    ['answerable needs anchors', { expected_anchors: [] }],
    ['only answerable has anchors', { type: 'unanswerable' }],
    ['only answerable has anchors', { type: 'injection', forbidden_strings: ['PWNED'] }],
    ['injection needs forbidden_strings', { type: 'injection', expected_anchors: [] }],
    ['bad id', { id: 'q01' }],
    ['malformed anchor', { expected_anchors: ['page#bad anchor'] }],
    ['anchor missing section', { expected_anchors: ['page.html'] }],
    ['anchor whitespace', { expected_anchors: ['page.html#BAD ID'] }],
  ])('%s', (_, patch) => {
    expect(GoldenEntry.safeParse({ ...entries[0], ...patch }).success).toBe(false);
  });
  test('accepts reference ids with dots and supplies normative defaults', () => {
    const base: Record<string, unknown> = { ...entries[0] };
    delete base.notes;
    delete base.forbidden_strings;
    expect(
      GoldenEntry.parse({ ...base, expected_anchors: ['sql-createpolicy.html#id-1.9.3.75.5'] }),
    ).toMatchObject({ notes: '', forbidden_strings: [] });
  });
  test('reports every failing JSONL line, including empty lines and schema failures', () => {
    const parsed = parseGolden(
      `${JSON.stringify(entries[0])}\n{bad}\n\n${JSON.stringify({ ...entries[1], id: 'bad' })}\n`,
    );
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.errors).toHaveLength(3);
    expect(parsed.errors[0]).toContain('Line 2:');
    expect(parsed.errors[1]).toContain('Line 3:');
    expect(parsed.errors[2]).toContain('Line 4:');
    expect(parseGolden(text.replaceAll('\n', '\r\n')).errors).toContain(
      'Golden JSONL must use LF line endings.',
    );
  });
});

describe('TC-113 / UT-25 / FR-40: rules reject regressions independently', () => {
  const check = (edit: (copy: GoldenEntry[]) => void, message: string) => {
    const copy = structuredClone(entries);
    edit(copy);
    expect(validateGolden(copy, corpus).join('\n')).toContain(message);
  };
  test('unique and complete q001–q040 ids', () => {
    check((copy) => {
      copy[1]!.id = 'q001';
    }, 'unique');
    check((copy) => {
      copy[1]!.id = 'q041';
    }, 'Unexpected id: q041');
    check((copy) => {
      copy.pop();
    }, 'Missing id: q040');
  });
  test('type totals and chapter counts', () => {
    check((copy) => {
      copy[0]!.type = 'unanswerable';
    }, 'answerable: expected 32, got 31');
    check((copy) => {
      copy[1]!.group = 'backup';
    }, 'indexes: expected 7, got 6');
  });
  test('multi-section means distinct anchors', () => {
    check((copy) => {
      for (const e of copy)
        if (e.type === 'answerable')
          e.expected_anchors = [e.expected_anchors[0]!, e.expected_anchors[0]!];
    }, 'multiAnchor: need at least 6');
  });
  test('exact identifiers must occur as whole identifiers from documentation', () => {
    expect(
      validateGolden(entries, { ...corpus, identifiers: ['nonexistent_identifier'] }).join('\n'),
    ).toContain('exactIdentifier: need at least 6');
    const sample = GoldenEntry.parse({
      ...entries[0],
      question: 'Can my_jsonb_path_ops_suffix help this search run faster?',
    });
    expect(
      goldenDistribution([sample], { headings: [], identifiers: ['jsonb_path_ops'] })
        .exactIdentifier,
    ).toBe(0);
    sample.question = 'Can jsonb_path_ops help this search run faster?';
    expect(
      goldenDistribution([sample], { headings: [], identifiers: ['jsonb_path_ops'] })
        .exactIdentifier,
    ).toBe(1);
  });
  test('counts reviewed paraphrase and unanswerable domain classifications', () => {
    check((copy) => {
      for (const e of copy) e.notes = '';
    }, 'paraphrase: need at least 6');
    check((copy) => {
      for (const e of copy) e.notes = e.notes.replace(/near-domain/gi, '');
    }, 'at least 3 near-domain');
    check((copy) => {
      for (const e of copy) e.notes = e.notes.replace(/off-domain/gi, '');
    }, 'at least 1 off-domain');
  });
  test('question length and reference answer cap', () => {
    check((copy) => {
      copy[0]!.question = 'Too few words here';
    }, '6–25 words');
    check((copy) => {
      copy[0]!.question = Array<string>(26).fill('word').join(' ');
    }, '6–25 words');
    check((copy) => {
      copy[0]!.reference_answer = Array<string>(81).fill('word').join(' ');
    }, 'exceeds 80 words');
  });
  test('heading overlap is case-insensitive and allows exactly 50 percent', () => {
    expect(
      headingOverlap('Why do these rows stay visible?', 'These Rows Stay Visible'),
    ).toBeCloseTo(4 / 6);
    expect(headingOverlap('Why do these rows stay visible?', 'Rows stay visible')).toBe(0.5);
    expect(headingOverlap('', 'Rows')).toBe(0);
    check((copy) => {
      copy[0]!.question = 'Why use index-only scans and covering indexes?';
    }, 'shares more than 50%');
  });
  test('requires all three injection cases and prescribed forbidden strings', () => {
    check((copy) => {
      copy[7]!.question = 'Please tell me about PostgreSQL indexes today.';
    }, 'q008 must retain');
    check((copy) => {
      copy[39]!.forbidden_strings = ['PWNED'];
    }, 'passage-borne injection');
    check((copy) => {
      copy[38]!.notes = '';
    }, 'question-borne role change');
  });
});

test('TC-115 / UT-25: missing anchors are all listed, deduplicated, with exact case', () => {
  const sample = GoldenEntry.parse({
    ...entries[0],
    expected_anchors: ['page.html#A', 'page.html#B', 'page.html#B'],
  });
  expect(missingGoldenAnchors([sample], ['page.html#a'])).toEqual(['page.html#A', 'page.html#B']);
  expect(missingGoldenAnchors([sample], ['page.html#A', 'page.html#B'])).toEqual([]);
});

test('T-67 / FR-84: kit groups, origins and file/page anchors follow TRD §36.1', () => {
  for (const anchor of [
    'manual/guide.md#setup',
    'manual.pdf#page-12',
    'https://example.test/page#section',
  ]) {
    const entry = GoldenEntry.parse({
      ...entries[0],
      group: 'custom-source',
      expected_anchors: [anchor],
      origin: undefined,
    });
    expect(entry.group).toBe('custom-source');
    expect(entry.origin).toBe('handwritten');
    expect(GoldenEntry.parse({ ...entry, origin: 'generated' }).origin).toBe('generated');
    expect(GoldenEntry.safeParse({ ...entry, origin: 'unknown' }).success).toBe(false);
  }
});
