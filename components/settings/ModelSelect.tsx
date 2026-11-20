'use client';

// T-91 model picker, shared by Settings › Models and keys and setup's Advanced settings.
import type { ModelOptions } from '@/components/setup/api';

export type Option = ModelOptions['chat'][number];
function priceHint(option: Option | undefined, role: 'chat' | 'embed'): string {
  if (!option?.price) return 'Price not set: cost estimates show “unknown”.';
  return role === 'embed'
    ? `$${String(option.price.input)} per 1M tokens.`
    : `$${String(option.price.input)} in / $${String(option.price.output)} out per 1M tokens.`;
}
export function ModelSelect({
  id,
  label,
  hint,
  options,
  value,
  onChange,
  warn = false,
  role = id === 'model-embed' ? 'embed' : 'chat',
  allowMissingKey = false,
  keyNote = true,
}: {
  id: string;
  role?: 'chat' | 'embed';
  // Setup asks for the key on the same step, so a model without one can still be chosen.
  allowMissingKey?: boolean;
  // Mock mode needs no keys, so the note would mislead.
  keyNote?: boolean;
  label: string;
  hint: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  warn?: boolean;
}) {
  const selected = options.find((option) => option.id === value);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-[1_1_240px]">
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        <p className="mt-1 text-sm text-[var(--ink-3)]" id={`${id}-hint`}>
          {hint} {priceHint(selected, role)}
        </p>
      </div>
      <select
        id={id}
        value={value}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={`h-11 min-w-[260px] rounded-[var(--radius-md)] border bg-[var(--surface)] px-3 ${warn ? 'border-[var(--warn)]' : 'border-[var(--rule-strong)]'}`}
      >
        {options.map((option) => (
          <option
            key={option.id}
            value={option.id}
            disabled={!allowMissingKey && !option.available && option.id !== value}
          >
            {option.model} · {option.providerLabel}
            {option.available || !keyNote
              ? ''
              : allowMissingKey
                ? ' (needs a key)'
                : ' (add a key)'}
          </option>
        ))}
      </select>
    </div>
  );
}
