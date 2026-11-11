import { pathToFileURL } from 'node:url';
import { runEvalValidation as run } from '@/lib/eval/validate';
export { readGoldenCorpus, runGoldenValidation } from '@/lib/eval/validate';

export async function runEvalValidation(
  args = process.argv.slice(2),
  write: (message: string) => void = console.log,
) {
  return (await run(args, write)).exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runEvalValidation();
  } catch {
    // Never expose raw database errors, connection strings or environment values.
    console.error(
      'Golden validation failed: check the arguments, corpus files and database connection.',
    );
    process.exitCode = 1;
  }
}
