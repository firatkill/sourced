import type { NextConfig } from 'next';

type BuildConfig = { plugins?: unknown[] };
const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: import.meta.dirname,
  webpack(config: BuildConfig, { isServer }) {
    if (!isServer) {
      let removed = 0;
      if (!config.plugins) throw new Error('Missing client build plugins');
      config.plugins = config.plugins.filter((plugin) => {
        const legacy =
          typeof plugin === 'object' &&
          plugin !== null &&
          'filePath' in plugin &&
          typeof plugin.filePath === 'string' &&
          plugin.filePath.endsWith('/next/dist/build/polyfills/polyfill-nomodule.js');
        if (legacy) removed += 1;
        return !legacy;
      });
      if (removed !== 1)
        throw new Error('Expected exactly one Next.js legacy noModule polyfill emitter');
    }
    return config;
  },
};
export default nextConfig;
