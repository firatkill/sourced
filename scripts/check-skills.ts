import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { checkSkills, generateReference, referencePath } from '@/lib/skills/check';

if (process.argv.slice(2).includes('--write')) {
  await mkdir(dirname(referencePath), { recursive: true });
  await writeFile(referencePath, generateReference());
} else {
  const problems = await checkSkills(process.cwd());
  for (const problem of problems)
    console.error(`${problem.file}:${String(problem.line)}: ${problem.message}`);
  process.exitCode = problems.length ? 1 : 0;
}
