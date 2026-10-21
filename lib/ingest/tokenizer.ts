import { getEncoding } from 'js-tiktoken';
import { CHUNKING } from '@/lib/config';

const tokenizer = getEncoding(CHUNKING.ENCODING);
export function encode(text: string): number[] {
  return tokenizer.encode(text);
}
export function decode(tokens: number[]): string {
  return tokenizer.decode(tokens);
}
export function countTokens(text: string): number {
  return encode(text).length;
}
