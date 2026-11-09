'use client';

import { Fragment, useId, useState } from 'react';
import type { QuestionResult } from '@/lib/eval/results-schema';
import { AnswerView } from '@/components/ask/AnswerView';
import { EVAL_COPY } from './copy';

const buttonClass =
  'min-h-9 cursor-pointer rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const ignoreSelection = () => undefined;
const typeLabels: Partial<Record<string, string>> = EVAL_COPY.types;

export function ResultsTable({ questions }: { questions: QuestionResult[] }) {
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const id = useId();
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-5">
      <h2 id={`${id}-heading`}>{EVAL_COPY.questions}</h2>
      <div className="flex gap-3">
        {[false, true].map((failures) => (
          <button
            key={String(failures)}
            type="button"
            aria-pressed={failuresOnly === failures}
            className={`${buttonClass} ${failuresOnly === failures ? 'border-primary text-primary' : ''}`}
            onClick={() => {
              setFailuresOnly(failures);
            }}
          >
            {failures ? EVAL_COPY.failures : EVAL_COPY.all}
          </button>
        ))}
      </div>
      <div
        className="overflow-x-auto p-1"
        role="region"
        aria-label={EVAL_COPY.questions}
        tabIndex={0}
      >
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{EVAL_COPY.questions}</caption>
          <thead>
            <tr>
              {EVAL_COPY.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="border-border border-b px-3 py-3 font-mono font-medium whitespace-nowrap"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {questions
              .filter((question) => !failuresOnly || !question.pass)
              .map((question, index) => {
                const open = expanded.has(question.id);
                const detailId = `${id}-detail-${String(index)}`;
                return (
                  <Fragment key={question.id}>
                    <tr className="border-border border-b [&>td]:px-3 [&>td]:py-3 [&>td]:align-top">
                      <th scope="row" className="px-3 py-3 align-top font-mono font-normal">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={detailId}
                          className={`${buttonClass} text-primary`}
                          onClick={() => {
                            setExpanded((current) => {
                              const next = new Set(current);
                              if (next.has(question.id)) next.delete(question.id);
                              else next.add(question.id);
                              return next;
                            });
                          }}
                        >
                          {question.id}
                        </button>
                      </th>
                      <td className="min-w-56">{question.question}</td>
                      <td>{typeLabels[question.type] ?? question.type}</td>
                      <td className="font-mono">
                        {question.type === 'answerable'
                          ? (question.recallAt5?.toFixed(2) ?? '—')
                          : '—'}
                      </td>
                      <td className="font-mono">
                        {question.type === 'answerable'
                          ? (question.reciprocalRank?.toFixed(2) ?? '—')
                          : '—'}
                      </td>
                      <td className="font-mono">{question.faithfulness?.score ?? '—'}</td>
                      <td className="font-mono whitespace-nowrap">
                        {question.citations.valid} /{' '}
                        {question.citations.valid + question.citations.invalid}
                      </td>
                      <td className={question.pass ? 'text-[var(--ok)]' : 'text-destructive'}>
                        {question.pass ? EVAL_COPY.pass : EVAL_COPY.fail}
                      </td>
                      <td className="font-mono whitespace-nowrap">
                        {(question.latencyMs / 1000).toFixed(1)} s
                      </td>
                    </tr>
                    <tr id={detailId} hidden={!open}>
                      <td
                        colSpan={EVAL_COPY.columns.length}
                        className="border-border bg-card border-b p-5"
                      >
                        {open && (
                          <dl className="space-y-4 break-words">
                            <div>
                              <dt className="font-medium">Answer</dt>
                              <dd>
                                <AnswerView
                                  text={question.answer}
                                  passages={[]}
                                  citations={null}
                                  onSelect={ignoreSelection}
                                />
                              </dd>
                            </div>
                            <div>
                              <dt className="font-medium">Cited passages</dt>
                              <dd>
                                <ul>
                                  {question.citedAnchors.map((anchor, i) => (
                                    <li key={`${anchor}-${String(i)}`} className="mono break-all">
                                      {anchor}
                                    </li>
                                  ))}
                                </ul>
                              </dd>
                            </div>
                            {question.faithfulness && (
                              <div>
                                <dt className="font-medium">Judge notes</dt>
                                <dd>
                                  <AnswerView
                                    text={question.faithfulness.rationale}
                                    passages={[]}
                                    citations={null}
                                    onSelect={ignoreSelection}
                                  />
                                  <ul>
                                    {question.faithfulness.unsupportedClaims.map((claim, i) => (
                                      <li key={i}>
                                        <AnswerView
                                          text={claim}
                                          passages={[]}
                                          citations={null}
                                          onSelect={ignoreSelection}
                                        />
                                      </li>
                                    ))}
                                  </ul>
                                </dd>
                              </div>
                            )}
                          </dl>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
