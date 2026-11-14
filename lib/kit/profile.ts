import 'server-only';
import { getKitConfig } from './runtime-config';

/** FR-64: all public-demo operating features share one profile boundary. */
export function isPublicDemo(): boolean {
  return getKitConfig().profile === 'public-demo';
}
