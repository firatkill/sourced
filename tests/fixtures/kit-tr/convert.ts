// T-52 bridge only: M6 folder/Markdown/generic HTML loaders replace this restricted converter.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { sha256Hex } from '../../../lib/hash';
import { chunkDocument } from '../../../lib/ingest/chunk';
import type { Block, ParsedDocument, Section } from '../../../lib/ingest/parse-html';
import type { IngestDocument } from '../../../lib/ingest/upsert';

export const documentsDirectory = fileURLToPath(new URL('./documents/', import.meta.url));

function markdownBlocks(text: string): Block[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((part): Block => {
      if (part.startsWith('```')) {
        if (!part.endsWith('```')) throw new Error('Fixture code fence is not closed');
        return { kind: 'code', text: part.replace(/^```[^\n]*\n/, '').replace(/\n```$/, '') };
      }
      if (part.startsWith('|'))
        return {
          kind: 'table',
          rows: part.split('\n').filter((row) => !/^\|[\s|:-]+\|$/.test(row)),
        };
      return { kind: 'paragraph', text: part.replaceAll('\n', ' ') };
    });
}

export function convertFixture(text: string, extension: '.md' | '.html'): ParsedDocument {
  const root: Section = { id: 'baslik', level: 1, heading: '', blocks: [], children: [] };
  if (extension === '.md') {
    const [intro = '', ...sections] = text.split(/^## /m);
    root.heading = /^# (.+)$/m.exec(intro)?.[1] ?? '';
    root.blocks = markdownBlocks(intro.replace(/^# .+\n/m, ''));
    for (const [index, section] of sections.entries()) {
      const newline = section.indexOf('\n');
      root.children.push({
        id: `bolum-${String(index + 1)}`,
        level: 2,
        heading: section.slice(0, newline),
        blocks: markdownBlocks(section.slice(newline + 1)),
        children: [],
      });
    }
  } else {
    const $ = load(text);
    root.heading = $('main > h1').text();
    let current = root;
    for (const element of $('main').children().toArray()) {
      const node = $(element);
      if (element.tagName === 'h1') continue;
      if (element.tagName === 'h2') {
        current = {
          id: node.attr('id') ?? '',
          level: 2,
          heading: node.text(),
          blocks: [],
          children: [],
        };
        root.children.push(current);
      } else if (element.tagName === 'p')
        current.blocks.push({ kind: 'paragraph', text: node.text() });
      else throw new Error(`Unsupported fixture HTML element: ${element.tagName}`);
    }
  }
  if (!root.heading || root.children.some((section) => !section.id || !section.heading))
    throw new Error('Fixture headings must have titles and anchors');
  return { title: root.heading, root };
}

export async function loadFixtureDocuments(): Promise<IngestDocument[]> {
  const files = (await readdir(documentsDirectory)).sort();
  return Promise.all(
    files.map(async (filename) => {
      const extension = filename.endsWith('.md') ? '.md' : '.html';
      if (!filename.endsWith(extension)) throw new Error('Unsupported fixture file');
      const bytes = await readFile(`${documentsDirectory}/${filename}`);
      const document = convertFixture(bytes.toString('utf8'), extension);
      return {
        slug: filename,
        url: `https://cep-bahcesi.example/${filename}`,
        title: document.title,
        version: '1',
        section: 'kilavuz',
        contentHash: sha256Hex(bytes),
        // This is the deployment's entire corpus, not an optional injection fixture.
        isFixture: false,
        chunks: chunkDocument(document, filename),
      };
    }),
  );
}
