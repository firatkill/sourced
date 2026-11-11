import { pathToFileURL } from 'node:url';
import { runEval as run } from '@/lib/eval/run';
export { checkPreconditions, evaluateQuestions, loadBaseline } from '@/lib/eval/run';

/** Compatibility API for existing script callers; implementation belongs to lib/. */
export function runEval(args = process.argv.slice(2), output?: Parameters<typeof run>[1]) {
  return run(
    args,
    output ?? {
      write: console.log,
      error: (message) => {
        console.error(message);
      },
    },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runEval();
