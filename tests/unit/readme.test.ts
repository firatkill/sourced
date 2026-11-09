import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync('README.md', 'utf8');

describe('TC-162: README sections (FR-57, TRD §27)', () => {
  it('keeps the required headings in order and the byte-exact first sentence', () => {
    expect(readme.split('\n\n')[1]).toBe(
      'A small, production-quality RAG app and starter kit: every claim in the answer cites a passage, and every citation is checked on the server before you see it.',
    );
    expect(readme.match(/^#{1,2} .+$/gm)).toEqual([
      '# Sourced',
      '## Links',
      '## Demo',
      '## How it works',
      '## Evaluation',
      '## Run locally without an API key',
      '## Run with OpenAI',
      '## Swap the corpus',
      '## Swap the provider',
      '## Cost',
      '## Tests and CI',
      '## Privacy',
      '## Limits',
      '## Versions',
      '## License',
    ]);
    expect(readme).toContain(
      'Built by Fırat Kıl · [firatkil.com](https://firatkil.com) · [GitHub](https://github.com/firatkill)',
    );
  });

  it('copies the recorded metrics and architecture without changes', () => {
    const results = readFileSync('eval/results/2026-11-09.md', 'utf8');
    const table = results.slice(results.indexOf('| Metric'), results.indexOf('\n\n## Failures'));
    expect(readme).toContain(table);
    const trd = readFileSync('docs/TRD.md', 'utf8');
    const start = trd.indexOf('```mermaid');
    expect(readme).toContain(trd.slice(start, trd.indexOf('```', start + 3) + 3));
  });

  it('lists exactly the six mock setup commands from TRD §27', () => {
    const section = readme
      .split('## Run locally without an API key')[1]
      ?.split('## Run with OpenAI')[0];
    expect(section?.match(/```sh\n([\s\S]*?)```/)?.[1]).toBe(
      'pnpm install\ncp .env.example .env.local\npnpm db:up\npnpm db:migrate\npnpm db:seed\npnpm dev:mock\n',
    );
  });
});
