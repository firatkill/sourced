import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdx from 'remark-mdx';
import type { Root, RootContent, PhrasingContent } from 'mdast';
import type { ParsedDocument, Section } from './parse-html';

type Node = Root | RootContent | PhrasingContent;
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Extract prose without ever evaluating MDX or retaining link destinations. */
function text(node: Node): string {
  switch (node.type) {
    case 'mdxjsEsm':
    case 'mdxFlowExpression':
    case 'mdxTextExpression':
    case 'yaml':
    case 'html':
    case 'definition':
      return '';
    case 'text':
    case 'inlineCode':
    case 'code':
      return node.value;
    case 'break':
      return '\n';
    default:
      return 'children' in node
        ? node.children.map((child) => text(child)).join(node.type === 'listItem' ? '\n' : '')
        : '';
  }
}

/** D-106: a single top-level scalar, deliberately not a YAML parser. */
function frontmatterTitle(value: string): string | undefined {
  const lines = value.split(/\r?\n/);
  const index = lines.findIndex((line) => /^title:[ \t]/.test(line));
  const line = lines[index];
  if (!line || /^[ \t]+\S/.test(lines[index + 1] ?? '')) return undefined;
  const scalar = line.slice('title:'.length).trim();
  const single = /^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/.exec(scalar);
  if (single) return single[1]?.replaceAll("''", "'").trim() || undefined;
  const double = /^"((?:[^"\\]|\\.)*)"[ \t]*(?:#.*)?$/.exec(scalar);
  if (double) {
    try {
      const decoded: unknown = JSON.parse(`"${double[1] ?? ''}"`);
      return typeof decoded === 'string' ? decoded.trim() || undefined : undefined;
    } catch {
      return undefined;
    }
  }
  if (/^[|>\[\]{}&*!'"#%@`]/.test(scalar)) return undefined;
  return scalar.replace(/[ \t]+#.*$/, '').trim() || undefined;
}

/** FR-69 / TRD §33.3. Markdown and MDX share the v1 section/block model. */
export function parseMarkdown(markdown: string, fileName: string, mdx = false): ParsedDocument {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml', 'toml']);
  if (mdx) processor.use(remarkMdx);
  const tree = processor.parse(markdown);
  const firstH1 = (node: Node): string | undefined => {
    if (node.type === 'heading' && node.depth === 1) return clean(text(node)) || undefined;
    if ('children' in node) {
      for (const child of node.children) {
        const heading = firstH1(child);
        if (heading) return heading;
      }
    }
    return undefined;
  };
  const matter = tree.children[0];
  const title =
    (matter?.type === 'yaml' ? frontmatterTitle(matter.value) : undefined) ??
    firstH1(tree) ??
    fileName;
  const root: Section = { id: '', level: 0, heading: title, blocks: [], children: [] };
  const stack = [root];
  let current = root;
  const slugs = new Set<string>();
  const slug = (heading: string) => {
    const base = heading
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}_\- ]/gu, '')
      .replaceAll(' ', '-');
    let result = base;
    let suffix = 0;
    while (slugs.has(result)) result = `${base}-${String(++suffix)}`;
    slugs.add(result);
    return result;
  };
  const visit = (node: Node): void => {
    switch (node.type) {
      case 'heading': {
        const heading = clean(text(node));
        while (stack.length > 1 && current.level >= node.depth) {
          stack.pop();
          current = stack.at(-1) ?? root;
        }
        const section: Section = {
          id: slug(text(node).trim()),
          level: node.depth,
          heading,
          blocks: [],
          children: [],
        };
        current.children.push(section);
        stack.push(section);
        current = section;
        return;
      }
      case 'paragraph':
      case 'mdxJsxTextElement': {
        const value = clean(text(node));
        if (value) current.blocks.push({ kind: 'paragraph', text: value });
        return;
      }
      case 'code':
        if (node.value.trim())
          current.blocks.push({
            kind: 'code',
            text: node.value,
            ...(node.lang ? { lang: node.lang } : {}),
          });
        return;
      case 'list': {
        const items = node.children.map((item) => clean(text(item))).filter(Boolean);
        if (items.length)
          current.blocks.push({ kind: 'list', items, ordered: node.ordered === true });
        return;
      }
      case 'table':
        current.blocks.push({
          kind: 'table',
          rows: node.children.map((row) =>
            row.children.map((cell) => clean(text(cell))).join(' | '),
          ),
        });
        return;
      case 'blockquote': {
        const value = clean(node.children.map((child) => text(child)).join('\n'));
        if (value) current.blocks.push({ kind: 'note', label: '', text: value });
        return;
      }
      case 'root':
      case 'mdxJsxFlowElement':
        for (const child of node.children) visit(child);
        return;
      default:
        return;
    }
  };
  visit(tree);
  return { title, root };
}
