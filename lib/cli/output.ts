import { commandSchemas } from './schemas/commands';
import type { CliEnvelope } from './envelope';
export function redact(text: string, secrets: readonly string[]): string {
  let safe = text;
  for (const secret of [...new Set(secrets)].sort((a, b) => b.length - a.length)) {
    if (secret.length >= 8) safe = safe.replaceAll(secret, '[REDACTED]');
  }
  return safe
    .replace(/\bpostgres(?:ql)?:\/\/[^\s<>"'`]+/gi, '[REDACTED]')
    .replace(/(https?:\/\/|postgres(?:ql)?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[REDACTED]@')
    .replace(/\b(?:sk-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+)/g, '[REDACTED]');
}
export function formatEnvelope(envelope: CliEnvelope, json: boolean): string {
  if (json) return `${JSON.stringify(envelope)}\n`;
  if (envelope.command === 'reset' && envelope.ok) {
    const reset = commandSchemas.reset.parse(envelope.result);
    const chats = reset.removedChats > 0 ? ` and ${String(reset.removedChats)} saved chats` : '';
    return `Removed ${String(reset.removedSources)} sources${chats === '' ? ' and' : ','} ${String(reset.removedDocuments)} indexed documents${chats}. Your files were not touched.\nNext: pnpm sourced add <folder or URL>\n`;
  }
  if (envelope.command === 'add' && envelope.ok) {
    const added = commandSchemas.add.parse(envelope.result);
    const where =
      'path' in added.source
        ? added.source.path
        : 'url' in added.source
          ? added.source.url
          : added.source.id;
    return `Added ${added.detected.type} source ${added.source.id} (${where}).\nNext: pnpm sourced ingest\n`;
  }
  if (envelope.command === 'setup' && envelope.ok) {
    const { url } = commandSchemas.setup.parse(envelope.result);
    return `Open this link to finish setup in your browser:\n${url}\nIt replaces any earlier link.\n`;
  }
  if (envelope.command === 'dev' && envelope.ok) {
    const dev = commandSchemas.dev.parse(envelope.result);
    return dev.setupUrl
      ? `Sourced is running. Finish setup in your browser:\n${dev.setupUrl}\n`
      : `Sourced is running at ${dev.url}\n`;
  }
  if (envelope.command.startsWith('docling ') && envelope.ok) {
    const docling = commandSchemas['docling status'].parse(envelope.result);
    const service = {
      ready: 'Docling is running.',
      starting: 'Docling is starting; it loads its models first, which takes a minute or two.',
      off: 'Docling is not running.',
    }[docling.service];
    const engine =
      docling.engine === 'docling'
        ? 'PDF, Word and PowerPoint files are read with Docling.'
        : 'PDF and Word files are read with the built-in readers.';
    const next = docling.changed
      ? 'pnpm sourced ingest (reads those files again; only changed passages are embedded again)'
      : docling.engine === 'docling' && docling.service !== 'ready'
        ? 'pnpm sourced docling on'
        : 'pnpm sourced ingest';
    return `${engine}\n${service}\nNext: ${next}\n`;
  }
  if (envelope.command === 'ingest' && envelope.ok) {
    const ingest = commandSchemas.ingest.safeParse(envelope.result);
    if (ingest.success) return formatIngest(ingest.data, envelope.warnings);
  }
  if (envelope.command === 'inspect' && envelope.ok) {
    const report = commandSchemas.inspect.parse(envelope.result);
    return [
      `Corpus: ${report.corpus}`,
      ...report.sources.map(
        (source) =>
          `${source.id}: ${String(source.documents)} documents, ${String(source.chunks)} chunks; tokens ${String(source.smallestChunkTokens ?? 'none')}–${String(source.largestChunkTokens ?? 'none')}`,
      ),
      ...report.findings.map(
        (finding) =>
          `${finding.severity}: ${finding.code}${finding.sourceId ? ` (${finding.sourceId})` : ''}${finding.count === undefined ? '' : `: ${String(finding.count)}`} — affects ${finding.affects.join(', ')}\n${finding.details ? JSON.stringify(finding.details) + '\n' : ''}Fix: ${finding.fix}`,
      ),
      `Report: ${report.path}`,
      '',
    ].join('\n');
  }
  const diagnostics =
    envelope.command === 'doctor' || envelope.command === 'deploy:check'
      ? commandSchemas.doctor.safeParse(envelope.result)
      : undefined;
  if (diagnostics?.success) {
    const lines = diagnostics.data.checks.map(
      (check) =>
        `${check.id}: ${check.ok ? 'OK' : 'FAIL'} - ${check.detail}${check.fix ? `\nFix: ${check.fix}` : ''}`,
    );
    return `${lines.join('\n')}\nNext: ${envelope.error?.fix ?? 'pnpm sourced --help'}\n`;
  }
  if (envelope.error)
    return `${envelope.error.message}\nNext: ${envelope.error.fix ?? 'pnpm sourced --help'}\n`;
  // Warnings are part of the outcome; human output must show them too (D-137).
  const warnings = envelope.warnings.map((warning) => `Warning: ${warning.message}\n`).join('');
  return `${warnings}${envelope.command} completed successfully.\n${envelope.result === undefined ? '' : JSON.stringify(envelope.result, null, 2) + '\n'}Next: pnpm sourced --help\n`;
}

/** D-137: a short human summary of an ingest result instead of the raw JSON. */
function formatIngest(
  result: ReturnType<typeof commandSchemas.ingest.parse>,
  warnings: CliEnvelope['warnings'],
): string {
  const { documents, chunks, embeddingTokens, estimatedCostUsd } = result.totals;
  const cost = estimatedCostUsd === null ? 'unknown' : `$${estimatedCostUsd.toFixed(4)}`;
  const lines = warnings.map((warning) => `Warning: ${warning.message}`);
  const embed = chunks.new + chunks.changed;
  if (result.mode === 'dry-run')
    lines.push(
      `Dry run: ${String(documents.done)} documents, ${String(embed)} passages to embed (${String(embeddingTokens)} tokens), ${String(chunks.unchanged)} unchanged, ${String(chunks.deleted)} to remove.`,
      `Estimated embedding cost: ${cost}. Nothing was sent to a provider.`,
    );
  else
    lines.push(
      `Indexed ${String(documents.done)} documents: ${String(chunks.new)} new, ${String(chunks.changed)} changed, ${String(chunks.unchanged)} unchanged and ${String(chunks.deleted)} removed passages.`,
      `Estimated embedding cost: ${cost}.`,
    );
  if (documents.skipped + documents.failed > 0)
    lines.push(
      `${String(documents.skipped)} skipped and ${String(documents.failed)} failed documents; pnpm sourced inspect explains why.`,
    );
  const next =
    result.mode === 'dry-run'
      ? warnings.some((warning) => warning.code === 'CORPUS_MISMATCH')
        ? 'pnpm sourced ingest --rebuild'
        : 'pnpm sourced ingest'
      : 'pnpm sourced dev';
  return `${lines.join('\n')}\nNext: ${next}\n`;
}
