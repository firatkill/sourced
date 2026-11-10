import { defineConfig } from './lib/kit/config-schema';
import { EMBEDDING } from './lib/config';
import manifest from './corpus/manifest.json';

export default defineConfig({
  schemaVersion: 1,
  corpus: {
    name: 'postgres-17',
    title: 'PostgreSQL docs',
    description: '35 pages of the PostgreSQL 17 documentation',
    language: 'en',
    attribution:
      'Answers are generated from the PostgreSQL 17 documentation, © The PostgreSQL Global Development Group, used under the',
    linkLabel: 'Read in the PostgreSQL docs',
  },
  sources: [
    {
      id: 'pg17',
      type: 'urls',
      commitRaw: true,
      html: {
        preset: 'postgres-docbook',
        contentSelector: manifest.contentSelector,
        removeSelectors: manifest.removeSelectors,
      },
      urls: manifest.pages.map((page) => manifest.baseUrl + page.slug),
    },
  ],
  models: {
    chat: { provider: 'openai', model: 'gpt-6-luna' },
    judge: { provider: 'openai', model: 'gpt-5.4' },
    embed: { provider: 'openai', model: EMBEDDING.MODEL, dimensions: EMBEDDING.DIMENSIONS },
  },
  pricing: {
    'openai:gpt-6-luna': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
    'openai:gpt-5.4': { inputPerMTok: 2.5, outputPerMTok: 15 },
    [`openai:${EMBEDDING.MODEL}`]: { inputPerMTok: 0.02 },
  },
  profile: 'public-demo',
  copy: {
    hero: 'Ask the PostgreSQL docs.',
    lead: 'Get a direct answer with working SQL. Every sentence links to the passage it comes from, and every quote is checked before you see it.',
    notFound: "I couldn't find this in the PostgreSQL docs.",
    documentTitle: 'Sourced: answers that show their sources',
    shortTitle: 'PostgreSQL 17 docs',
    headerScope: 'Answers only from 35 pages of the PostgreSQL 17 docs',
    scope:
      'Answers come only from 35 pages of the PostgreSQL 17 documentation. If the answer is not there, Sourced says so.',
    placeholder: 'e.g. How do I find slow queries with EXPLAIN ANALYZE?',
    nextPlaceholder: 'Ask another question about PostgreSQL 17',
    notFoundBody:
      'Sourced only answers from the 35 pages it has indexed. These passages came closest:',
    searched: 'Searched 35 pages',
    viewerLink: 'Open on postgresql.org',
    sourceDomain: 'postgresql.org/docs/17',
    license: { name: 'PostgreSQL License', url: 'https://www.postgresql.org/about/licence/' },
    promptSubject: 'PostgreSQL 17',
    rerankSubject: 'PostgreSQL',
    suggested: [
      {
        id: 'iso',
        topic: 'Transactions',
        text: 'What is the difference between REPEATABLE READ and SERIALIZABLE?',
      },
      { id: 'partial', topic: 'Indexes', text: 'When should I use a partial index?' },
      { id: 'explain', topic: 'Performance', text: 'How do I read the output of EXPLAIN ANALYZE?' },
      { id: 'jsonb', topic: 'Data types', text: 'Should I store JSON as json or jsonb?' },
      {
        id: 'rls',
        topic: 'Security',
        text: 'How does row-level security decide which rows a user can see?',
      },
      {
        id: 'wraparound',
        topic: 'Maintenance',
        text: 'Why does VACUUM matter, and what is transaction ID wraparound?',
      },
    ],
  },
  overrides: { contextualEmbedding: false },
});
