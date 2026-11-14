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
  return `${envelope.command} completed successfully.\n${envelope.result === undefined ? '' : JSON.stringify(envelope.result, null, 2) + '\n'}Next: pnpm sourced --help\n`;
}
