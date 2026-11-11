import { CONFIGURATION_COPY } from '@/lib/copy';

export function ConfigurationError({ fixes }: { fixes: readonly string[] }) {
  return (
    <main id="content" tabIndex={-1} className="shell space-y-4 py-12">
      <h1>{CONFIGURATION_COPY.heading}</h1>
      <p>{CONFIGURATION_COPY.body}</p>
      <ul className="list-disc space-y-2 pl-6">
        {fixes.map((fix) => (
          <li key={fix}>{fix}</li>
        ))}
      </ul>
    </main>
  );
}
