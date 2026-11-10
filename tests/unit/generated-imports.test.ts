// Fresh-clone regression requirement 2: independent of any cached snapshot.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(path) ? [path] : [];
  });
}

function importSpecifiers(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  function visit(node: ts.Node): void {
    let specifier: ts.Node | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      specifier = node.moduleSpecifier;
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
      specifier = node.moduleReference.expression;
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      specifier = node.argument.literal;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      specifier = node.arguments[0];
    if (specifier && ts.isStringLiteralLike(specifier)) specifiers.push(specifier.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return specifiers;
}

test('source modules never import generated .sourced files', () => {
  const files = [
    ...['app', 'lib', 'components', 'hooks', 'scripts'].flatMap(sourceFiles),
    'middleware.ts',
    'instrumentation.ts',
  ];
  expect(
    files.flatMap((file) =>
      importSpecifiers(file, readFileSync(file, 'utf8'))
        .filter((specifier) => specifier.split('/').includes('.sourced'))
        .map((specifier) => `${file}: ${specifier}`),
    ),
  ).toEqual([]);
});

test('T-58 / TRD §8: app and library modules never import script entry points', () => {
  const files = ['app', 'lib', 'components', 'hooks'].flatMap(sourceFiles);
  expect(
    files.flatMap((file) =>
      importSpecifiers(file, readFileSync(file, 'utf8'))
        .filter((specifier) => specifier.split('/').includes('scripts'))
        .map((specifier) => `${file}: ${specifier}`),
    ),
  ).toEqual([]);
});

test.each([
  "import { run } from '@/scripts/eval';",
  "export { run } from '../../scripts/eval';",
  "export * from '@/scripts/eval';",
  "const run = import('@/scripts/eval');",
  "const run = require('../../scripts/eval');",
  "import run = require('../../scripts/eval');",
  "type Run = import('@/scripts/eval').Run;",
])('T-58: dependency scan includes %s', (text) => {
  expect(importSpecifiers('probe.ts', text)).toHaveLength(1);
  expect(importSpecifiers('probe.ts', text)[0]?.split('/')).toContain('scripts');
});
