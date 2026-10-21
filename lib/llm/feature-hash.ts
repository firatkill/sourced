import 'server-only';
import { EMBEDDING } from '@/lib/config';

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

export function featureHash(text: string): { vector: number[]; tokens: number } {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
  const vector = Array<number>(EMBEDDING.DIMENSIONS).fill(0);
  const add = (token: string, weight: number) => {
    const index = fnv1a(token) % EMBEDDING.DIMENSIONS;
    const sign = fnv1a(`${token}#`) & 0x80000000 ? -1 : 1;
    vector[index] = (vector[index] ?? 0) + sign * weight;
  };
  for (const [index, word] of words.entries()) {
    add(word, 1);
    const next = words[index + 1];
    if (next !== undefined) add(`${word} ${next}`, 0.5);
  }
  const norm = Math.hypot(...vector);
  if (norm === 0) vector[0] = 1;
  else
    for (let index = 0; index < vector.length; index++) vector[index] = (vector[index] ?? 0) / norm;
  return { vector, tokens: words.length };
}
