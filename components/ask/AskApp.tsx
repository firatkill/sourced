'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAsk } from '@/hooks/useAsk';
import { FOLLOWUP, QUESTION } from '@/lib/config';
import type { SuggestedId } from '@/lib/suggested';
import { ASK_COPY, EMPTY_LIBRARY_COPY, type CorpusCopy } from '@/lib/copy';
import { AskForm } from './AskForm';
import { SuggestedQuestions } from './SuggestedQuestions';
import { DemoOff, ReadonlyBanner } from './states/DemoState';
import { rateLimitCopy } from './states/RateLimited';
import { ChatRail } from './ChatRail';
import { Turn, type ChatTurn } from './Turn';
import { SourceViewer } from './SourceViewer';
import { ExampleBanner } from './ExampleBanner';
import { EmptyLibraryBanner } from './EmptyLibraryBanner';
import { restoreTurn, savedTurn } from './restore';
import type { SidebarData } from '@/components/sidebar/ChatSidebar';
import { CHATS_CHANGED, announceChatsChanged, chatStore } from '@/lib/chats/client';
import { appendSessionTurn, getSessionChat, readRaw } from '@/lib/chats/session-store';
import type { SavedTurn } from '@/lib/chats/store';

/** D-142: saved chats outside the hosted demo. `chat` is set on `/c/[chatId]`. */
export type SavedChats = {
  initial: SidebarData;
  chat?: { id: string; projectId: string | null; title: string; turns: SavedTurn[] };
  /** `/?project=<id>`: the first question creates the chat inside this project. */
  projectId?: string;
  /** D-154: `/c/[chatId]` in the hosted demo; the browser reads the chat from this tab. */
  sessionChatId?: string;
};

const SERVER_RENDER = '\u0000server';
function subscribeSession(listener: () => void) {
  window.addEventListener(CHATS_CHANGED, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHATS_CHANGED, listener);
    window.removeEventListener('storage', listener);
  };
}
/** The tab's copy of a hosted-demo chat; `loading` until the browser has read sessionStorage. */
function useSessionChat(id: string | undefined) {
  const raw = useSyncExternalStore(
    subscribeSession,
    () => (id ? (readRaw() ?? '') : ''),
    () => (id ? SERVER_RENDER : ''),
  );
  const loading = raw === SERVER_RENDER;
  const chat = id && !loading ? getSessionChat(id) : null;
  useEffect(() => {
    // A link to a chat this tab does not have (another tab, or the tab was closed) starts fresh.
    if (id && !loading && !chat && window.location.pathname === `/c/${id}`)
      window.history.replaceState(null, '', '/');
  }, [id, loading, chat]);
  return {
    loading,
    chat: chat
      ? { id: chat.id, projectId: chat.projectId, title: chat.title, turns: chat.turns }
      : undefined,
  };
}

type Props = {
  publicDemo?: boolean;
  demoMode: 'on' | 'readonly' | 'off';
  limits: { ipDaily: number; globalDaily: number };
  suggested: readonly { id: SuggestedId; question: string; topic?: string }[];
  copy: CorpusCopy;
  /** REDESIGN-v2 §3.3: facts from the index; absent in the hosted demo. */
  library?:
    | {
        pill: string;
        searching: string | null;
        /** D-150: set when this chat's project searches only some sources. */
        scoped?: string | undefined;
      }
    | undefined;
  /** Local profile with the bundled example loaded (copy.exampleNotice). */
  example?: { notice: string } | undefined;
  /** D-153: the local library has no documents (it was reset); chats stay readable. */
  emptyLibrary?: boolean | undefined;
  saved?: SavedChats | undefined;
};
export function AskApp(props: Props) {
  const [session, setSession] = useState(0);
  const [mode, setMode] = useState(props.demoMode);
  const tab = useSessionChat(session === 0 ? props.saved?.sessionChatId : undefined);
  const first = props.saved && tab.chat ? { ...props.saved, chat: tab.chat } : props.saved;
  // A new chat starts empty: the server-provided chat and project apply to the first session only.
  const saved = props.saved && session > 0 ? { initial: props.saved.initial } : first;
  // A new chat is outside the project, so it searches the whole library again.
  const library =
    props.library && session > 0 ? { ...props.library, scoped: undefined } : props.library;
  return (
    <Conversation
      key={`${String(session)}:${tab.chat?.id ?? ''}`}
      loading={tab.loading}
      {...props}
      library={library}
      saved={saved}
      demoMode={mode}
      onMode={setMode}
      onNew={() => {
        if (props.saved && window.location.pathname !== '/')
          window.history.replaceState(null, '', '/');
        setSession((n) => n + 1);
      }}
    />
  );
}
function Conversation({
  publicDemo = true,
  demoMode,
  limits,
  suggested,
  copy,
  library,
  example,
  emptyLibrary = false,
  saved,
  loading = false,
  onNew,
  onMode,
}: Props & {
  loading?: boolean;
  onNew: () => void;
  onMode: (mode: Props['demoMode']) => void;
}) {
  const ask = useAsk(demoMode);
  const inTab = saved?.initial.storage === 'session';
  const chatApi = chatStore(saved?.initial.storage);
  const savedPhase = useRef<unknown>(null);
  const [chatId, setChatId] = useState(saved?.chat?.id);
  const chatIdRef = useRef(saved?.chat?.id);
  // T-84: a saved chat opens with its turns restored from the server's snapshot.
  const [history, setHistory] = useState<ChatTurn[]>(
    () => saved?.chat?.turns.map((turn, index) => restoreTurn(turn, index + 1)) ?? [],
  );
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
  // D-154: the hosted demo saves each finished turn in this tab, as the server does elsewhere.
  useEffect(() => {
    const id = chatIdRef.current;
    if (!inTab || !id || !active || savedPhase.current === ask.phase) return;
    const turn = savedTurn(ask.phase, ask.citations);
    if (!turn) return;
    savedPhase.current = ask.phase;
    try {
      appendSessionTurn(id, turn);
      announceChatsChanged();
    } catch {
      // The answer stays on screen; it just is not kept in this tab.
    }
  }, [inTab, active, ask.phase, ask.citations]);
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
    // T-85 / FR-91: the last answered turns travel with a follow-up (a retry resends its own).
    // A suggested question stands alone, so it keeps its prepared answer and quota exemption.
    const earlier = (id !== undefined ? [] : retry ? turns.slice(0, -1) : turns)
      .flatMap((turn) =>
        turn.phase.kind === 'done'
          ? [
              {
                question: turn.question,
                answer: turn.phase.citations.answer.slice(0, FOLLOWUP.MAX_ANSWER_CHARS),
              },
            ]
          : [],
      )
      .slice(-FOLLOWUP.MAX_TURNS);
    if (current && !retry) setHistory((previous) => [...previous, current]);
    setActive({ id: retry && active ? active.id : turns.length + 1, question });
    setDraft('');
    try {
      // D-142: the first question of a new chat creates it, so the turn can be saved.
      if (saved && !chatIdRef.current) {
        try {
          const chat = await chatApi.createChat({ question, projectId: saved.projectId ?? null });
          chatIdRef.current = chat.id;
          setChatId(chat.id);
          window.history.replaceState(null, '', `/c/${chat.id}`);
          announceChatsChanged();
        } catch {
          // The question is still answered; it just is not saved.
        }
      }
      const context = {
        ...(chatIdRef.current && !inTab ? { chatId: chatIdRef.current } : {}),
        ...(earlier.length > 0 ? { history: earlier } : {}),
      };
      await ask.submit(question, id, Object.keys(context).length > 0 ? context : undefined);
      // The server saves the turn right after the stream ends; refresh the sidebar's order.
      if (chatIdRef.current && !inTab) setTimeout(announceChatsChanged, 400);
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
      copy={copy}
      question={draft}
      onChange={setDraft}
      onSubmit={() => {
        void submit(draft);
      }}
      inputRef={ask.inputRef}
      inFlight={ask.inFlight}
      disabled={effectiveMode !== 'on' || emptyLibrary}
      disabledPlaceholder={emptyLibrary ? EMPTY_LIBRARY_COPY.placeholder : undefined}
      dailyLimit={publicDemo ? limits.ipDaily : null}
      error={ask.phase.kind === 'validationError' ? ask.phase.message : null}
      hasTurns={turns.length > 0}
    />
  );
  // REDESIGN-v2 §3.1: no suggestions block at all when the corpus has none.
  const suggestions = suggested.length > 0 && !emptyLibrary && (
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
        copy={copy}
        saved={saved ? { initial: saved.initial, activeChatId: chatId } : undefined}
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
          <p className="truncate text-sm font-semibold">
            {saved?.chat?.title ?? turns[0]?.question ?? copy.hero}
          </p>
          <p className="text-xs text-[var(--ink-3)]">{library?.pill ?? copy.headerScope}</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
          <div className="mx-auto w-full max-w-[760px] space-y-10">
            {turns.length === 0 && loading ? null : turns.length === 0 ? (
              effectiveMode === 'off' ? (
                <DemoOff />
              ) : (
                <>
                  {emptyLibrary ? (
                    <EmptyLibraryBanner />
                  ) : (
                    example && <ExampleBanner notice={example.notice} />
                  )}
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
                  {library?.scoped ? (
                    <p className="-mt-6 text-sm text-[var(--ink-3)]">{library.scoped}</p>
                  ) : (
                    library?.searching &&
                    suggested.length === 0 && (
                      <p className="-mt-6 text-sm text-[var(--ink-3)]">{library.searching}</p>
                    )
                  )}
                  {suggestions}
                  <p className="text-sm text-[var(--ink-3)]">
                    {copy.scope}{' '}
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
                    copy={copy}
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
            <div className="mx-auto max-w-[760px] space-y-3">
              {emptyLibrary && <EmptyLibraryBanner />}
              {composer}
              {library?.scoped && <p className="text-sm text-[var(--ink-3)]">{library.scoped}</p>}
            </div>
          </div>
        )}
        <div role="status" aria-live="polite" className="sr-only" data-ask-status>
          {announcement}
        </div>
      </main>
      {viewer && selectedMeta && selectedTurn?.citations && (
        <SourceViewer
          copy={copy}
          fileLinks={saved !== undefined && !inTab}
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
