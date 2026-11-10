import { execFileSync } from 'node:child_process';

/** Generate once outside test workers, whose filesystem/provider transports may be mocked. */
export default function setup(): void {
  execFileSync('pnpm', ['config:snapshot'], {
    env: { ...process.env, LLM_MODE: 'mock' },
    stdio: 'pipe',
  });
}
