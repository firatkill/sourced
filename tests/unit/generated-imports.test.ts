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

test('source modules never import generated .sourced files', () => {
  const violations: string[] = [];
  const files = [
    ...['app', 'lib', 'components', 'hooks', 'scripts'].flatMap(sourceFiles),
    'middleware.ts',
    'instrumentation.ts',
  ];
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node: ts.Node): void {
      let specifier: ts.Node | undefined;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        specifier = node.moduleSpecifier;
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
        specifier = node.moduleReference.expression;
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      )
        specifier = node.arguments[0];
      if (
        specifier &&
        ts.isStringLiteralLike(specifier) &&
        specifier.text.split('/').includes('.sourced')
      )
        violations.push(`${file}: ${specifier.text}`);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(violations).toEqual([]);
});
