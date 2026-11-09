'use client';

import { useEffect, useRef, useState } from 'react';
import { useAsk } from '@/hooks/useAsk';
import { QUESTION } from '@/lib/config';
import type { SuggestedId } from '@/lib/suggested';
import { ASK_COPY } from '@/lib/copy';
import { AskForm } from './AskForm';
import { SuggestedQuestions } from './SuggestedQuestions';
import { DemoOff, ReadonlyBanner } from './states/DemoState';
import { rateLimitCopy } from './states/RateLimited';
import { ChatRail } from './ChatRail';
import { Turn, type ChatTurn } from './Turn';
import { SourceViewer } from './SourceViewer';

type Props = {
  demoMode: 'on' | 'readonly' | 'off';
  limits: { ipDaily: number; globalDaily: number };
  suggested: readonly { id: SuggestedId; question: string; topic: string }[];
  copy: { hero: string; lead: string };
};
export function AskApp(props: Props) {
  const [session, setSession] = useState(0);
  const [mode, setMode] = useState(props.demoMode);
  return (
    <Conversation
      key={session}
      {...props}
      demoMode={mode}
      onMode={setMode}
      onNew={() => {
        setSession((n) => n + 1);
      }}
    />
  );
}
function Conversation({
  demoMode,
  limits,
  suggested,
  copy,
  onNew,
  onMode,
}: Props & { onNew: () => void; onMode: (mode: Props['demoMode']) => void }) {
  const ask = useAsk(demoMode);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [active, setActive] = useState<{ id: number; question: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [viewer, setViewer] = useState<{ turn: number; label: string } | null>(null);
  const [effectiveMode, setEffectiveMode] = useState(demoMode);
  const busyRef = useRef(false);
  const viewerOpener = useRef<HTMLElement | null>(null);
  const responseMode =
    ask.phase.kind === 'readonly' ? 'readonly' : ask.phase.kind === 'demoOff' ? 'off' : null;
  if (responseMode !== null && effectiveMode !== responseMode) setEffectiveMode(responseMode);
  useEffect(() => {
    onMode(effectiveMode);
  }, [effectiveMode, onMode]);
  const current: ChatTurn | null = active
    ? { ...active, phase: ask.phase, citations: ask.citations }
    : null;
  const turns = current ? [...history, current] : history;
  const selectedTurn = turns.find((turn) => turn.id === viewer?.turn);
  const selectedMeta =
    selectedTurn && 'meta' in selectedTurn.phase ? selectedTurn.phase.meta : null;
  async function submit(question: string, id?: SuggestedId, retry = false) {
    if (ask.inFlight || busyRef.current) return;
    const valid =
      question.trim().length >= QUESTION.MIN_CHARS && question.trim().length <= QUESTION.MAX_CHARS;
    if (!valid) {
      if (current) setHistory((previous) => [...previous, current]);
      setActive(null);
      void ask.submit(question, id);
      return;
    }
    busyRef.current = true;
    setViewer(null);
    if (current && !retry) setHistory((previous) => [...previous, current]);
    setActive({ id: retry && active ? active.id : turns.length + 1, question });
    setDraft('');
    try {
      await ask.submit(question, id);
    } finally {
      busyRef.current = false;
    }
  }
  const count = ask.citations?.valid.length ?? 0;
  const rate =
    ask.phase.kind === 'rateLimited'
      ? rateLimitCopy(ask.phase.scope, ask.phase.resetAt, limits)
      : null;
  const announcement =
    ask.phase.kind === 'done'
      ? `Answer ready with ${String(count)} verified ${count === 1 ? 'source' : 'sources'}.`
      : ask.phase.kind === 'notFound'
        ? ASK_COPY.notFoundAnnouncement
        : ask.phase.kind === 'stopped'
          ? ASK_COPY.stoppedAnnouncement
          : ask.phase.kind === 'providerError'
            ? ASK_COPY.providerHeading
            : rate
              ? `${rate.heading}. ${rate.body}`
              : ask.status.replace(/…$/, '');
  useEffect(() => {
    if (ask.phase.kind === 'rateLimited' || ask.phase.kind === 'submitting')
      ask.inputRef.current?.focus();
  }, [ask.phase.kind, ask.inputRef, active?.id]);
  const composer = (
    <AskForm
      question={draft}
      onChange={setDraft}
      onSubmit={() => {
        void submit(draft);
      }}
      inputRef={ask.inputRef}
      inFlight={ask.inFlight}
      disabled={effectiveMode !== 'on'}
      dailyLimit={limits.ipDaily}
      error={ask.phase.kind === 'validationError' ? ask.phase.message : null}
      hasTurns={turns.length > 0}
    />
  );
  const suggestions = (
    <SuggestedQuestions
      suggested={suggested}
      disabled={ask.inFlight}
      onSelect={(question, id) => {
        void submit(question, id);
      }}
    />
  );
  return (
    <div className="chat-shell flex h-dvh flex-col md:flex-row">
      <ChatRail
        turns={turns}
        busy={ask.inFlight}
        onNew={() => {
          if (!ask.inFlight) onNew();
        }}
      />
      <main
        id="content"
        tabIndex={-1}
        className="chat-main flex min-h-0 min-w-0 flex-1 flex-col p-0"
      >
        <header className="flex h-[60px] shrink-0 flex-col justify-center border-b border-[var(--rule)] px-5">
          <p className="truncate text-sm font-semibold">{turns[0]?.question ?? copy.hero}</p>
          <p className="text-xs text-[var(--ink-3)]">{ASK_COPY.headerScope}</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
          <div className="mx-auto w-full max-w-[760px] space-y-10">
            {turns.length === 0 ? (
              effectiveMode === 'off' ? (
                <DemoOff />
              ) : (
                <>
                  <div className="space-y-4">
                    {effectiveMode === 'readonly' ? (
                      <ReadonlyBanner />
                    ) : (
                      <>
                        <h1>{copy.hero}</h1>
                        <p className="text-[var(--ink-2)]">{copy.lead}</p>
                      </>
                    )}
                  </div>
                  {composer}
                  {suggestions}
                  <p className="text-sm text-[var(--ink-3)]">
                    {ASK_COPY.scope}{' '}
                    <a href="/eval" className="text-[var(--accent)] underline">
                      {ASK_COPY.scopeLink}
                    </a>
                  </p>
                </>
              )
            ) : (
              <>
                {(ask.phase.kind === 'rateLimited' || effectiveMode === 'readonly') && suggestions}
                {turns.map((turn) => (
                  <Turn
                    key={turn.id}
                    turn={turn}
                    limits={limits}
                    selected={viewer?.turn === turn.id ? viewer.label : null}
                    onSelect={(label) => {
                      viewerOpener.current =
                        document.activeElement instanceof HTMLElement
                          ? document.activeElement
                          : null;
                      setViewer({ turn: turn.id, label });
                    }}
                    onRetry={() => {
                      void submit(turn.question, undefined, turn.id === active?.id);
                    }}
                    onStop={() => {
                      ask.stop();
                      busyRef.current = false;
                    }}
                    onAnother={() => {
                      setDraft(turn.question);
                      requestAnimationFrame(() => {
                        ask.inputRef.current?.focus();
                        ask.inputRef.current?.select();
                      });
                    }}
                  />
                ))}
              </>
            )}
          </div>
        </div>
        {turns.length > 0 && effectiveMode !== 'off' && (
          <div className="shrink-0 border-t border-[var(--rule)] bg-[var(--ground)] px-4 py-3 sm:px-8">
            <div className="mx-auto max-w-[760px]">{composer}</div>
          </div>
        )}
        <div role="status" aria-live="polite" className="sr-only" data-ask-status>
          {announcement}
        </div>
      </main>
      {viewer && selectedMeta && selectedTurn?.citations && (
        <SourceViewer
          passages={selectedMeta.passages}
          citations={selectedTurn.citations}
          label={viewer.label}
          onSelect={(label) => {
            setViewer({ ...viewer, label });
          }}
          onClose={() => {
            setViewer(null);
            requestAnimationFrame(() => {
              if (viewerOpener.current?.isConnected) viewerOpener.current.focus();
            });
          }}
        />
      )}
    </div>
  );
}
