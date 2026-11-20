import type { CorpusCopy } from '@/lib/kit/copy';

import { getCopy } from '@/lib/kit/copy';
// Components receive UI copy only (D-140): prompt subjects never reach the browser.
export type { UiCopy as CorpusCopy } from '@/lib/kit/copy';

// Generic fallbacks only. The server passes the mounted corpus's rendered copy as props.
export const CORPUS_COPY: CorpusCopy = getCopy({
  corpus: {
    name: 'documents',
    title: 'your documents',
    description: 'your documents',
    language: 'en',
    linkLabel: 'Read the source',
  },
  copy: { suggested: [] },
  overrides: { retrieval: {} },
});
export const CONFIGURATION_COPY = {
  heading: 'Sourced needs configuration',
  body: 'Fix the settings below in .env.local, then restart Sourced.',
  snapshot: 'Check sourced.config.ts and run ./sourced config:snapshot, then restart Sourced.',
};

// Corpus-specific UI copy (PRD §9.2–9.3, FR-74).
export const ASK_COPY = {
  ...CORPUS_COPY,
  limit:
    '{limit} questions per visitor per day. Suggested questions are answered instantly and do not count.',
  suggestions: 'Start with one of these',
  // T-84: opening a cited file in saved-chat mode.
  openFile: 'Open the file',
  openAtPage: 'Open at page',
  fileMissing: 'This document is no longer in your library. The passage below is the saved copy.',
  // REDESIGN-v2 §3.2 example banner (local profile only).
  exampleBannerLabel: 'About the example',
  exampleBannerBefore: 'To use your own documents, run',
  exampleBannerThen: 'and then',
  exampleBannerCopy: 'Copy commands',
  exampleBannerCopied: 'Commands copied',
  exampleBannerHide: 'Hide this notice',
  scopeLink: 'See how it is measured',
  sessionPrivacy:
    'Kept in this tab only. Reload or close it and the chat is gone; nothing is stored on the server.',
  viewerNote: 'Highlighted: the sentence the answer quotes.',
  relatedReading: 'Related reading',
  anotherQuestion: 'Ask another question',
  tryAgain: 'Try again',
  notFoundAnnouncement: 'No answer found in the docs. Related reading is listed.',
  visitorLimitHeading: 'You’ve reached today’s limit',
  visitorLimitBody:
    'Each visitor can ask {limit} questions per day so the demo stays free to run. Your limit resets at {time} ({relative}).',
  suggestedStillWork: 'The suggested questions above still work.',
  globalLimitHeading: 'The demo has reached its daily limit',
  globalLimitBody:
    'Sourced answers up to {limit} questions a day across all visitors. It resets at {time} ({relative}). The suggested questions still work, and you can run Sourced yourself from the GitHub repository.',
  readonlyBanner:
    'Live answers are paused. The six suggested questions below were answered in advance and still work.',
  readonlyPlaceholder: 'Live answers are paused',
  offlineHeading: 'The demo is offline for maintenance',
  offlineBody: 'The evaluation results and the write-up are still available.',
  evaluationLink: 'See evaluation results',
  howItWorksLink: 'Read how it works',
  providerHeading: 'The language model didn’t respond',
  providerBody: 'This is usually temporary.',
  providerRefundedBody:
    'This is usually temporary. This question was not counted toward your daily limit.',
  networkHeading: 'Connection lost',
  networkBody: 'The answer stopped arriving. Check your connection and try again.',
  partialLabel: 'Partial answer, not verified',
  serverHeading: 'Something went wrong on our side',
  serverBody: 'The error has been logged with reference {requestId}. Try again in a minute.',
  stoppedLabel: 'Stopped. This partial answer was not verified.',
  stoppedAnnouncement: 'Stopped',
  disclosure: 'How this was answered',
  rankedCaption: 'Passages ranked for this answer',
  rankColumns: ['Passage', 'Vector rank', 'Keyword rank', 'RRF score', 'After rerank'],
  emptyRank: '—',
  reranked: 'Reranked by the language model.',
  rerankFallback: 'Reranker timed out; passages are in fused search order.',
  timings:
    'Retrieval {retrieval} ms · Rerank {rerank} ms · Generation {generation} s · Total {total} s',
  tokens: 'Tokens: {in} in, {out} out · Estimated cost ${cost}',
  cached:
    'This answer was generated in advance on {date} and served from the cache. No language model was called.',
  quoteFallback:
    'The model did not include supporting quotes, so they were extracted in a second call.',
  removedOne: '1 citation was removed because its quote was not found in the passage.',
  removedMany: '{n} citations were removed because their quotes were not found in the passages.',
  removedCitation: '{label} removed: {reason}.',
  removalReasons: {
    UNKNOWN_PASSAGE: 'it points to a passage that was not retrieved',
    NO_QUOTE: 'no supporting quote was given',
    QUOTE_TOO_SHORT: 'the quote was too short to check',
    QUOTE_TOO_LONG: 'the quote was too long',
    QUOTE_NOT_FOUND: 'the quote was not found in the passage',
  },
} as const;

export function formatAskCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder: string, key: string) =>
    values[key] === undefined ? placeholder : String(values[key]),
  );
}

export function removedCitationsCopy(count: number): string {
  return count === 1 ? ASK_COPY.removedOne : formatAskCopy(ASK_COPY.removedMany, { n: count });
}

// PRD §9.9 / D-134.
export const ACCESS_COPY = {
  title: 'Access · Sourced',
  heading: 'This chatbot is private',
  body: 'Enter the access token you were given.',
  label: 'Access token',
  button: 'Continue',
  error: 'That token is not valid.',
  limited: 'Too many attempts. Try again in an hour.',
} as const;

// T-83 / REDESIGN-v2 §7: the saved-chats sidebar (local and private profiles).
export const SIDEBAR_COPY = {
  projects: 'Projects',
  newProject: 'New project',
  projectName: 'Project name',
  noProjects: 'Group related chats into a project.',
  search: 'Search chats',
  chats: 'Chats',
  empty: 'Your chats will show up here.',
  noMatches: 'No chats match.',
  storage: 'Chats are saved on this computer.',
  groups: {
    Pinned: 'Pinned',
    Today: 'Today',
    Yesterday: 'Yesterday',
    'Previous 7 days': 'Previous 7 days',
    Older: 'Older',
  },
  options: 'Options for',
  rename: 'Rename',
  chatName: 'Chat name',
  renameHint: 'Enter to save · Esc to cancel',
  moveTo: 'Move to project',
  noProject: 'No project',
  back: 'Back',
  pin: 'Pin to top',
  unpin: 'Unpin',
  delete: 'Delete',
  cancel: 'Cancel',
  deleteTitle: 'Delete this chat?',
  deleteBody: 'and its answers are removed from this computer. This can’t be undone.',
  loadError: 'Chats could not be loaded. Check that the database is running.',
  saveError: 'That change was not saved. Try again.',
  privacy: 'Privacy: chats are saved in this computer’s database.',
};

// T-83: the project page.
export const PROJECT_COPY = {
  label: 'Project',
  name: 'Project name',
  description: 'Description',
  edit: 'Rename project',
  save: 'Save',
  cancel: 'Cancel',
  newChat: 'New chat in this project',
  chats: 'Chats',
  empty: 'No chats in this project yet. Start one, or move a chat here from its menu.',
  delete: 'Delete project',
  deleteTitle: 'Delete this project?',
  deleteBody: 'Its chats are kept and move back to the general list.',
  deleteConfirm: 'Delete project',
  saveError: 'That change was not saved. Try again.',
};
