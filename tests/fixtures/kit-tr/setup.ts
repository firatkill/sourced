import { setupFixtureDatabase } from './database';

// Uses only the host/credentials; database.ts always targets sourced_kit_tr.
const report = await setupFixtureDatabase(process.env.DATABASE_URL);
console.log(
  `kit-tr: ${String(report.documentsTotal)} documents, ${String(report.chunksTotal)} chunks, ${String(report.embeddingInputs)} mock embeddings`,
);
