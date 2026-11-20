'use client';

// T-92 / R2 Settings › Chats and data: download a chat as Markdown, or delete every chat.
import { useState } from 'react';
import { settingsApi } from '@/components/setup/api';
import { announceChatsChanged } from '@/lib/chats/client';
import { ConfirmButton } from './Confirm';

type Chat = { id: string; title: string; updatedAt: string };

export function ChatsData({ chats: initial }: { chats: Chat[] }) {
  const [chats, setChats] = useState(initial);
  const [message, setMessage] = useState('');
  return (
    <div className="max-w-3xl">
      <h1>Chats and data</h1>
      <p className="text-[var(--ink-2)]">
        Chats are saved in the database on this computer. Removing documents or the example never
        deletes them.
      </p>
      <p role="status" className="mt-2 text-sm text-[var(--ok)]">
        {message}
      </p>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Export</h2>
      {chats.length === 0 ? (
        <p className="text-[var(--ink-2)]">No saved chats.</p>
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)]">
          {chats.map((chat) => (
            <li
              key={chat.id}
              className="flex flex-wrap items-center gap-3 border-b border-[var(--rule)] px-4 py-2 last:border-b-0"
            >
              <span className="min-w-0 flex-[1_1_240px] truncate">{chat.title}</span>
              <a
                href={`/api/chats/${chat.id}/export`}
                download
                aria-label={`Download ${chat.title} as Markdown`}
                className="inline-flex h-11 items-center rounded-[var(--radius-md)] px-3 text-sm text-[var(--accent)] underline"
              >
                Download .md
              </a>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold">Delete</h2>
      <p className="mb-3 text-sm text-[var(--ink-2)]">
        Deletes every saved chat and project. This cannot be undone.
      </p>
      <ConfirmButton
        label="Delete all chats"
        question={`Delete ${String(chats.length)} ${chats.length === 1 ? 'chat' : 'chats'} and all projects?`}
        confirmLabel="Delete all chats"
        onConfirm={async () => {
          const { removedChats } = await settingsApi.deleteAllChats();
          setChats([]);
          setMessage(`Deleted ${String(removedChats)} ${removedChats === 1 ? 'chat' : 'chats'}.`);
          announceChatsChanged();
        }}
      />
    </div>
  );
}
