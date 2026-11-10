// Compatibility for direct v1 script invocations; package aliases use sourced.
process.argv.splice(2, 0, 'ingest');
await import('./sourced');
export {};
