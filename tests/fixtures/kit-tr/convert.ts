// T-52 bridge only: M6 folder/Markdown/generic HTML loaders replace this restricted converter.
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { loadCorpus } from '../../../lib/ingest/load';
import { KitConfigSchema } from '../../../lib/kit/config-schema';
import fixtureConfig from './sourced.config';
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
  return loadCorpus({
    config: KitConfigSchema.parse(fixtureConfig),
    offline: true,
    refresh: false,
    includeFixtures: false,
    parse: (raw) => {
      if (raw.mimeType !== 'text/markdown' && raw.mimeType !== 'text/html')
        throw new Error('Unsupported fixture file');
      return convertFixture(
        Buffer.from(raw.bytes).toString('utf8'),
        raw.mimeType === 'text/markdown' ? '.md' : '.html',
      );
    },
  });
}
