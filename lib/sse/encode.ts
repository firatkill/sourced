import { SSE } from '@/lib/config';
import type { SseEvent } from '@/lib/sse/events';

const encoder = new TextEncoder();
export function encodeEvent(e: SseEvent): Uint8Array {
  return encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
}
export const HEARTBEAT = encoder.encode(': ping\n\n');

/** The route calls the returned cleanup before closing its stream (TRD §12.3). */
export function startHeartbeat(send: (bytes: Uint8Array) => void): () => void {
  const timer = setInterval(() => {
    send(HEARTBEAT);
  }, SSE.HEARTBEAT_MS);
  return () => {
    clearInterval(timer);
  };
}
