import { execFileSync } from 'node:child_process';

/** Generate once outside test workers, whose filesystem/provider transports may be mocked. */
export default function setup(): void {
  execFileSync('pnpm', ['config:snapshot'], {
    // D-138: the suite exercises the hosted example, which runs the shipped config as public-demo.
    env: { ...process.env, LLM_MODE: 'mock', SOURCED_PROFILE: 'public-demo' },
    stdio: 'pipe',
  });
}
