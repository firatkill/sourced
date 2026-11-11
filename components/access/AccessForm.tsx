'use client';
import { useState, type SubmitEvent } from 'react';
import { ACCESS_COPY } from '@/lib/copy';
import { ErrorBody } from '@/lib/errors';

export function AccessForm() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/access', { method: 'POST', body });
      if (response.redirected && response.ok) {
        window.location.assign(new URL('/', window.location.href).href);
        return;
      }
      const parsed = ErrorBody.safeParse(await response.json());
      setError(
        parsed.success && parsed.data.error.code === 'RATE_LIMITED_IP'
          ? ACCESS_COPY.limited
          : ACCESS_COPY.error,
      );
    } catch {
      setError(ACCESS_COPY.error);
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      action="/api/access"
      method="post"
      onSubmit={(event) => {
        void submit(event);
      }}
      className="mt-6 flex max-w-md flex-col gap-3"
    >
      <label htmlFor="access-token">{ACCESS_COPY.label}</label>
      <input
        id="access-token"
        name="token"
        type="password"
        autoComplete="current-password"
        required
        aria-invalid={!!error}
        aria-describedby={error ? 'access-error' : undefined}
        className="border-border bg-card focus-visible:outline-ring rounded-md border p-3 focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      {error && (
        <p id="access-error" role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground focus-visible:outline-ring rounded-md px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        {ACCESS_COPY.button}
      </button>
    </form>
  );
}
