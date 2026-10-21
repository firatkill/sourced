'use client';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <h1>Something went wrong</h1>
      <p>The page failed to load. Try again, or come back later.</p>
      <button
        type="button"
        className="border-border mt-5 rounded-md border px-4 py-2"
        onClick={reset}
      >
        Try again
      </button>
    </>
  );
}
