import 'server-only';
import pino, { type DestinationStream, type Logger } from 'pino';
import { getEnv } from '@/lib/env';

let cliDestination: DestinationStream | undefined;
/** The CLI sends all library logs through its redacted stderr boundary. */
export function setCliLogDestination(destination: DestinationStream): void {
  cliDestination = destination;
}

export function createLogger(destination?: DestinationStream): Logger {
  const env = getEnv();
  return pino(
    {
      level: env.LOG_LEVEL,
      base: { app: 'sourced', env: env.VERCEL_ENV ?? 'local' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.apiKey',
        '*.question',
        'apiKey',
        'question',
        'ip',
        '*.ip',
        'prompt',
        '*.prompt',
        'modelOutput',
        '*.modelOutput',
      ],
    },
    destination ?? cliDestination,
  );
}
let logger: Logger | undefined;
export function withRequest(requestId: string): Logger {
  logger ??= createLogger();
  return logger.child({ requestId });
}
