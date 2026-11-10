import robotsParser from 'robots-parser';
import { AppError } from '@/lib/errors';
import { FETCH } from '@/lib/config';

export class RobotsDisallowedError extends AppError {
  constructor(url: string) {
    super('INTERNAL_ERROR', `Robots policy disallows ${url}`);
  }
}

export async function loadRobots(baseUrl: string, request: (url: string) => Promise<Response>) {
  const url = new URL('/robots.txt', baseUrl).href;
  let response: Response;
  try {
    response = await request(url);
  } catch (cause) {
    throw new AppError('INTERNAL_ERROR', 'Cannot fetch robots.txt.', { cause });
  }
  if (!response.ok && response.status !== 404)
    throw new AppError('INTERNAL_ERROR', 'Cannot fetch robots.txt.');
  const policy = robotsParser(url, response.status === 404 ? '' : await response.text());
  const agent = FETCH.USER_AGENT.split('/')[0];
  const delay = policy.getCrawlDelay(agent);
  return {
    intervalMs: Math.max(FETCH.MIN_INTERVAL_MS, Number.isFinite(delay) ? (delay ?? 0) * 1000 : 0),
    assertAllowed(pageUrl: string) {
      if (policy.isAllowed(pageUrl, agent) === false) throw new RobotsDisallowedError(pageUrl);
    },
  };
}

/** A rejected policy promise is retained: a host cannot fail open later in the run. */
export function createRobotsCache(request: (url: string) => Promise<Response>) {
  const policies = new Map<string, ReturnType<typeof loadRobots>>();
  return (url: string) => {
    const origin = new URL(url).origin;
    let policy = policies.get(origin);
    if (!policy) {
      policy = loadRobots(origin, request);
      policies.set(origin, policy);
    }
    return policy;
  };
}
