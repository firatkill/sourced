import { Writable } from 'node:stream';
import { confirm } from '@inquirer/prompts';
import { AppError } from '@/lib/errors';
export async function confirmAction(options: {
  yes: boolean;
  json: boolean;
  isTTY: boolean;
  message: string;
  prompt?: (message: string) => Promise<boolean>;
}): Promise<void> {
  if (options.yes) return;
  if (!options.isTTY || options.json)
    throw new AppError('NEEDS_CONFIRMATION', 'Confirmation is required. Run again with --yes.');
  const answer = await (options.prompt ?? ((message) => confirm({ message, default: false })))(
    options.message,
  );
  if (!answer) throw new AppError('NEEDS_CONFIRMATION', 'The operation was not confirmed.');
}

/** Prompts need immediate cursor writes, not the CLI's buffered log stream. */
export function createConfirmPrompt(write: (text: string) => void) {
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      write(chunk.toString('utf8'));
      callback();
    },
  });
  return (message: string) => confirm({ message, default: false }, { output });
}
