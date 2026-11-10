import { NO_SOURCES } from '@/lib/cli/commands/config-files';
import { setCliLogDestination } from '@/lib/logger';
import { getCliSecrets } from '@/lib/env';
import { dispatch, failure } from '@/lib/cli/router';
import { formatEnvelope, redact } from '@/lib/cli/output';
import { createConfirmPrompt } from '@/lib/cli/prompts';
import { helpText } from '@/lib/cli/registry';

const args = process.argv.slice(2);
const json = args.includes('--json');
const stdout = process.stdout.write.bind(process.stdout);
const stderr = process.stderr.write.bind(process.stderr);
const secrets = getCliSecrets();
const safe = (message: string) => redact(message, secrets);
let finished = false;
const progress = (message: string) => {
  if (json) stderr(`${JSON.stringify({ event: 'progress', message: safe(message) })}\n`);
  else stdout(`${safe(message).replace(/\n$/, '')}\n`);
};
// Libraries and legacy scripts may still write to a stream. Buffer complete lines so
// split writes cannot leak fragments of a secret or corrupt the JSON stdout contract.
const buffers = { stdout: '', stderr: '' };
function redirect(stream: 'stdout' | 'stderr'): typeof process.stdout.write {
  return (
    chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean => {
    buffers[stream] +=
      typeof chunk === 'string'
        ? chunk
        : Buffer.from(chunk).toString(typeof encoding === 'string' ? encoding : 'utf8');
    const lines = buffers[stream].split('\n');
    buffers[stream] = lines.pop() ?? '';
    for (const line of lines) {
      if (json) stderr(`${JSON.stringify({ event: 'progress', message: safe(line) })}\n`);
      else (stream === 'stderr' ? stderr : stdout)(`${safe(line)}\n`);
    }
    const done = typeof encoding === 'function' ? encoding : callback;
    done?.();
    return true;
  };
}
process.stdout.write = redirect('stdout');
process.stderr.write = redirect('stderr');
setCliLogDestination({
  write: (message) => {
    process.stderr.write(message);
  },
});
function finish(envelope: Parameters<typeof formatEnvelope>[0], exitCode: number) {
  if (finished) return;
  finished = true;
  for (const buffer of Object.values(buffers)) if (buffer) progress(buffer);
  // Redact string leaves before serialization so keys with quotes/newlines stay valid JSON.
  const sanitized: unknown = JSON.parse(
    JSON.stringify(envelope, (_key, value: unknown) =>
      typeof value === 'string' ? safe(value) : value,
    ),
  );
  const parsed = CliEnvelope.parse(sanitized);
  // These fields are registry-owned literals, never environment or user input.
  // A local DB password such as the app name must not corrupt the next command.
  parsed.command = envelope.command;
  if (parsed.error && envelope.error?.message === NO_SOURCES) parsed.error.message = NO_SOURCES;
  if (parsed.error && envelope.error?.fix) parsed.error.fix = envelope.error.fix;
  if (!json && (parsed.command === 'help' || args.includes('--help'))) stdout(`${helpText()}\n`);
  else stdout(formatEnvelope(parsed, json));
  process.exitCode = exitCode;
}
import { CliEnvelope } from '@/lib/cli/envelope';
const interrupt = () => {
  // Ingest owns graceful draining while its SIGINT listener is installed.
  if (process.listenerCount('SIGINT') > 1) return;
  finish(failure('sourced', 'INTERNAL_ERROR', 'The command was interrupted.'), 130);
  process.exit(130);
};
process.on('SIGINT', interrupt);
try {
  const result = await dispatch(args, {
    progress,
    isTTY: process.stdin.isTTY,
    prompt: createConfirmPrompt((message) => {
      stderr(safe(message));
    }),
  });
  finish(result.envelope, result.exitCode);
} catch {
  finish(failure('sourced', 'INTERNAL_ERROR', 'The command failed unexpectedly.'), 1);
} finally {
  process.removeListener('SIGINT', interrupt);
}
