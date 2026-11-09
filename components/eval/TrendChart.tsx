import { useId } from 'react';

export function TrendChart({
  label,
  values,
  format,
}: {
  label: string;
  values: number[];
  format: (value: number) => string;
}) {
  const titleId = useId();
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 80 : 2 + (index / (values.length - 1)) * 156;
      const y = max === min ? 20 : 38 - ((value - min) / (max - min)) * 36;
      return `${String(x)},${String(y)}`;
    })
    .join(' ');
  return (
    <figure className="space-y-3">
      <figcaption className="mono">{label}</figcaption>
      <svg
        width="160"
        height="40"
        viewBox="0 0 160 40"
        role="img"
        aria-labelledby={titleId}
        className="text-primary"
      >
        <title id={titleId}>{`${label}: ${values.map(format).join(', ')}`}</title>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
        {values.length === 1 && <circle cx="80" cy="20" r="2" fill="currentColor" />}
      </svg>
    </figure>
  );
}
