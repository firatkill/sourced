import { readdirSync, readFileSync } from 'node:fs';
import { load } from 'cheerio';
import { describe, expect, test } from 'vitest';
import { tokenizeSql } from '@/lib/highlight/sql';

// REDESIGN §5.2: lexical categories and lossless highlighting, independent of React.
describe('R1 SQL tokenizer — REDESIGN §5.2', () => {
  test.each([
    ['SELECT', 'keyword'],
    ['explain', 'keyword'],
    ['JSONB', 'keyword'],
    ['POLICY', 'keyword'],
    ['GENERATED', 'keyword'],
    ['ORDINALITY', 'keyword'],
    ['count(x)', 'function'],
    ["'it''s SQL'", 'string'],
    ['"a""b"', 'identifier'],
    ['12.5e-2', 'number'],
    ['.5', 'number'],
    ['$1', 'number'],
    ['-- SELECT\n', 'comment'],
    ['/* SELECT */', 'comment'],
    ['+', 'operator'],
    ['(', 'operator'],
    ['table_name', 'identifier'],
    [' \n\t', 'space'],
    ["$$it's $1$$", 'string'],
    ['$tag$select $$x$$ $tag$', 'string'],
  ])('%s begins with a %s token', (source, type) => {
    const tokens = tokenizeSql(source);
    expect(tokens[0]?.type).toBe(type);
    expect(tokens.map((token) => token.text).join('')).toBe(source);
  });

  test('dollar delimiters, escaped quotes, and nested-looking comments stay intact', () => {
    for (const source of [
      "'a''--/*b'",
      '"x""y"',
      '$tag$a $other$b$other$ $$ c$tag$',
      '/* outer /* inner */ still outer */',
      '/* unterminated',
      '$tag$unterminated',
      "'unterminated",
    ]) {
      expect(tokenizeSql(source)).toHaveLength(1);
      expect(tokenizeSql(source)[0]?.text).toBe(source);
    }
    expect(
      tokenizeSql('1+/* a */2-- b\nSELECT')
        .filter((t) => t.type === 'comment')
        .map((t) => t.text),
    ).toEqual(['/* a */', '-- b']);
    expect(tokenizeSql('')).toEqual([]);
  });

  const files = readdirSync('corpus/postgres-17/raw', { recursive: true, encoding: 'utf8' }).filter(
    (name) => name.endsWith('.html'),
  );
  test('corpus fixture is present', () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const file of files) {
    test(`every decoded programlisting round-trips: ${file}`, () => {
      const $ = load(readFileSync(`corpus/postgres-17/raw/${file}`, 'utf8'));
      $('pre.programlisting').each((_, block) => {
        const source = $(block).text(); // HTML parser decodes named and numeric entities.
        const tokens = tokenizeSql(source);
        expect(tokens.map((token) => token.text).join('')).toBe(source);
        expect(tokens.every((token) => token.text.length > 0)).toBe(true);
      });
    });
  }

  test('10,000 characters tokenize in under 20 ms', () => {
    const source = 'SELECT count(*) FROM t WHERE x = $1; -- comment\n'.repeat(250).slice(0, 10000);
    const start = performance.now();
    const tokens = tokenizeSql(source);
    const elapsed = performance.now() - start;
    expect(source).toHaveLength(10000);
    expect(tokens.map((token) => token.text).join('')).toBe(source);
    expect(elapsed).toBeLessThan(20);
  });
});
