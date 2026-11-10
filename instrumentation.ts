// Injected by next.config.ts so Edge bundles never import Node-only startup code.
declare const SOURCED_NODE_RUNTIME: boolean;
export async function register() {
  if (SOURCED_NODE_RUNTIME) {
    const { getKitConfig } = await import('./lib/kit/runtime-config');
    const { getSql } = await import('./lib/db/client');
    const { checkAppCorpusSchema } = await import('./lib/kit/vector-schema');
    await checkAppCorpusSchema(getSql(), getKitConfig());
  }
}
