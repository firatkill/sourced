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
