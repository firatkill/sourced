import { ASK_COPY } from '@/lib/copy';

export function ReadonlyBanner() {
  return (
    <p role="status" className="border-border rounded border p-4">
      {ASK_COPY.readonlyBanner}
    </p>
  );
}

export function DemoOff() {
  return (
    <section className="space-y-4">
      <h2>{ASK_COPY.offlineHeading}</h2>
      <p>{ASK_COPY.offlineBody}</p>
      <div className="flex flex-wrap gap-4">
        <a href="/eval">{ASK_COPY.evaluationLink}</a>
        <a href="/how-it-works">{ASK_COPY.howItWorksLink}</a>
      </div>
    </section>
  );
}
