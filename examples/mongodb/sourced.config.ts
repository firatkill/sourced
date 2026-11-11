import { defineConfig } from '../../lib/kit/config-schema';

// T-64 any-corpus check (PRD §11, A-25): 200 pages of the MongoDB manual from its public
// sitemap. The fetched pages are not committed; robots.txt rules are honoured at fetch time.
export default defineConfig({
  schemaVersion: 1,
  corpus: {
    name: 'mongodb-manual',
    title: 'MongoDB manual',
    description: '200 pages of the MongoDB manual',
    language: 'en',
    attribution: 'MongoDB documentation, © MongoDB, Inc.',
    linkLabel: 'Read in the MongoDB manual',
  },
  sources: [
    {
      id: 'manual',
      type: 'sitemap',
      url: 'https://www.mongodb.com/docs/manual/sitemap-0.xml',
      include: ['/docs/manual/**'],
      exclude: ['**/*.pdf', '**/*.epub'],
      maxPages: 200,
    },
  ],
  profile: 'local',
  models: {
    chat: { provider: 'openai', model: 'gpt-6-luna' },
    embed: { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },
  },
  pricing: {
    'openai:gpt-6-luna': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
    'openai:text-embedding-3-small': { inputPerMTok: 0.02 },
  },
});
