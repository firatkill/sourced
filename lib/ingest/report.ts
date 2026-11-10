export type IngestReport = {
  corpusVersion: string;
  sources?: { id: string; revision?: string }[];
  documentsTotal: number;
  documentsChanged: number;
  documentsRemoved: number;
  chunksTotal: number;
  chunksInserted: number;
  chunksUpdated: number;
  chunksUnchanged: number;
  chunksDeleted: number;
  embeddingInputs: number;
  embeddingTokens: number;
  costUsdEstimate: number;
  includeFixtures: boolean;
  durationMs: number;
};

export function formatIngestReport(report: IngestReport, finishedAt: Date): string {
  return [
    `Sourced ingest  ${finishedAt.toISOString()}  corpus_version ${report.corpusVersion}`,
    `documents   ${String(report.documentsTotal)} total   ${String(report.documentsChanged)} changed   ${String(report.documentsRemoved)} removed   (fixtures: ${report.includeFixtures ? 'yes' : 'no'})`,
    `chunks      ${String(report.chunksTotal)} total   ${String(report.chunksInserted)} inserted   ${String(report.chunksUpdated)} updated   ${String(report.chunksUnchanged)} unchanged   ${String(report.chunksDeleted)} deleted`,
    `embedding   ${String(report.embeddingInputs)} inputs   ${report.embeddingTokens.toLocaleString('en-US')} tokens   est. $${report.costUsdEstimate.toFixed(4)}`,
    ...(report.sources ?? [])
      .filter((source) => source.revision)
      .map((source) => `source ${source.id} revision ${source.revision ?? ''}`),
    `duration    ${(report.durationMs / 1000).toFixed(1)} s`,
  ].join('\n');
}
