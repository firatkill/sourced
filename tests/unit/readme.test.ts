import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync('README.md', 'utf8');

describe('TC-162: README sections (FR-57, TRD §27)', () => {
  it('keeps the required headings in order and the byte-exact first sentence', () => {
    expect(readme.split('\n\n')[1]).toBe(
      'A small, production-quality RAG app and starter kit: every claim in the answer cites a passage, and every citation is checked on the server before you see it.',
    );
    // D-139: a short, local-first README; the detail lives in docs/GUIDE.md.
    expect(readme.match(/^#{1,2} .+$/gm)).toEqual([
      '# Sourced',
      '## Links',
      '## Demo',
      '## Quick start',
      '## Use your own documents',
      '## How it works',
      '## License',
    ]);
    expect(readme).not.toMatch(/vercel|supabase|\/deploy/i);
    expect(readme).toContain(
      'Built by Fırat Kıl · [firatkil.com](https://firatkil.com) · [GitHub](https://github.com/firatkill)',
    );
  });

  it('the guide copies the recorded metrics and architecture without changes', () => {
    const guide = readFileSync('docs/GUIDE.md', 'utf8');
    const results = readFileSync('eval/postgres-17/results/2026-11-09.md', 'utf8');
    const table = results.slice(results.indexOf('| Metric'), results.indexOf('\n\n## Failures'));
    expect(guide).toContain(table);
    const trd = readFileSync('docs/TRD.md', 'utf8');
    const start = trd.indexOf('```mermaid');
    expect(guide).toContain(trd.slice(start, trd.indexOf('```', start + 3) + 3));
  });

  it('the guide lists exactly the six mock setup commands from TRD §27', () => {
    const guide = readFileSync('docs/GUIDE.md', 'utf8');
    const section = guide
      .split('## Node path without an API key')[1]
      ?.split('## Node path with OpenAI')[0];
    expect(section?.match(/```sh\n([\s\S]*?)```/)?.[1]).toBe(
      'pnpm install\ncp .env.example .env.local\npnpm db:up\npnpm db:migrate\npnpm db:seed\npnpm dev:mock\n',
    );
  });
});

describe('D-138 / D-139 / D-146: the quick start needs only Docker and one command', () => {
  it('starts the app and follows the browser; the terminal path stays below it', () => {
    const quick = readme.split('## Quick start')[1]?.split('## Use your own documents')[0] ?? '';
    const blocks = [...quick.matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1]);
    expect(blocks).toEqual([
      'git clone https://github.com/firatkill/sourced.git\ncd sourced\n',
      './sourced dev\n',
      'cp .env.example .env.local\n',
      './sourced ingest\n./sourced dev\n',
    ]);
    expect(quick).toContain('`./sourced setup` prints a new one');
    expect(quick).toContain('`OPENAI_API_KEY=`');
  });
  it('replaces the example with reset before adding documents', () => {
    const own = readme.split('## Use your own documents')[1]?.split('## How it works')[0] ?? '';
    const blocks = [...own.matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1]);
    expect(blocks).toEqual([
      './sourced reset\n',
      './sourced add ./my-docs\n./sourced ingest\n./sourced dev\n',
      // D-152: the optional Docling reader.
      './sourced docling on\n',
    ]);
  });
  it('the env template asks for exactly one value', () => {
    const lines = readFileSync('.env.example', 'utf8')
      .split('\n')
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line));
    expect(lines).toEqual(['OPENAI_API_KEY=']);
  });
});
