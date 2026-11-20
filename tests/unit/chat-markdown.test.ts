// T-92: a saved chat exported as Markdown keeps its markers, quotes and their locations.
import { describe, expect, it } from 'vitest';
import { chatMarkdown, markdownFileName } from '@/lib/chats/markdown';
import type { SavedTurn } from '@/lib/chats/store';
import { citations, meta, passage } from '../fixtures/sse-streams';

const turn = (overrides: Partial<SavedTurn> = {}): SavedTurn => ({
  id: '00000000-0000-4000-8000-000000000001',
  position: 0,
  question: 'When does a partial index help?',
  standaloneQuestion: null,
  status: 'done',
  createdAt: '2026-11-20T10:00:00.000Z',
  answer: {
    meta: { ...meta, passages: [{ ...passage, label: 'P1' }] },
    answerText: 'raw',
    citations: {
      ...citations,
      answer: 'It helps when most rows are excluded [P1].',
      valid: [
        {
          label: 'P1',
          quote: 'A partial index\\ncovers a subset.',
          quoteSpan: { start: 0, end: 10 },
        },
      ],
    },
    done: null,
  },
  ...overrides,
});

describe('chatMarkdown', () => {
  it('writes the title, each question, the verified answer and its quoted sources', () => {
    const text = chatMarkdown({
      id: 'c',
      projectId: null,
      title: 'Partial indexes',
      titleSource: 'user',
      pinned: false,
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z',
      turns: [
        turn(),
        turn({
          question: 'Can it also be unique?',
          standaloneQuestion: 'Can a partial index also be unique?',
          answer: { ...turn().answer, citations: null, answerText: '' },
        }),
      ],
    });
    expect(text).toContain('# Partial indexes\n\nSaved from Sourced on 2026-11-20.');
    expect(text).toContain(
      '## When does a partial index help?\n\nIt helps when most rows are excluded [P1].',
    );
    expect(text).toContain(`**[P1] ${passage.documentTitle}**, ${passage.headingPath.join(' › ')}`);
    expect(text).toContain('> A partial index');
    expect(text).toContain('_Searched for: Can a partial index also be unique?_');
    expect(text).toContain('_No answer was saved for this question._');
    expect(text.endsWith('\n')).toBe(true);
  });
  it('makes a portable file name', () => {
    expect(markdownFileName('Partial indexes: when?')).toBe('partial-indexes-when.md');
    expect(markdownFileName('Çalışan izni / 2026')).toBe('calsan-izni-2026.md');
    expect(markdownFileName('???')).toBe('chat.md');
  });
});
