declare module '*.css';

// Pinned Mammoth 1.13.0 archive adapter: reuse its ZIP reader/writer for core
// properties and fixture generation rather than adding another dependency.
declare module 'mammoth/lib/zipfile' {
  export function openArrayBuffer(bytes: Uint8Array): Promise<{
    exists(name: string): boolean;
    read(name: string, encoding: string): Promise<string>;
    write(name: string, contents: string | Uint8Array): void;
    toArrayBuffer(): Promise<ArrayBuffer>;
  }>;
}
