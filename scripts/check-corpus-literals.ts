import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Check source literals, including JSX text and template segments. Documentation,
// legal notices, SQL migration comments and language aliases are not corpus copy.
const forbidden = /PostgreSQL|postgresql\.org|35 pages/;
const allowed = /^(?:sourced\.config\.ts$|(?:corpus|eval|docs|tests|qa)\/)/;
export function checkCorpusLiterals(root = process.cwd()): string[] {
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' },
  ).split('\0');
  const violations: string[] = [];
  for (const file of new Set(files)) {
    if (allowed.test(file) || !/\.(?:[cm]?[jt]sx?)$/.test(file)) continue;
    const content = readFileSync(path.join(root, file), 'utf8');
    if (!forbidden.test(content)) continue;
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node): void {
      if (
        (ts.isStringLiteralLike(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node) ||
          ts.isJsxText(node)) &&
        forbidden.test(node.text)
      ) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        violations.push(
          `${file}:${String(line + 1)}: corpus-specific literal belongs in sourced.config.ts`,
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return violations;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const violations = checkCorpusLiterals();
  if (violations.length) {
    process.stderr.write(violations.join('\n') + '\n');
    process.exitCode = 1;
  } else process.stdout.write('Corpus literal check passed.\n');
}
