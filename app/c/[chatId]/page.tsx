import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AskPage } from '@/components/ask/AskPage';
import { z } from 'zod';
import { NotFoundError, getChat } from '@/lib/chats/store';
import { isPublicDemo } from '@/lib/kit/profile';

type Props = { params: Promise<{ chatId: string }> };

async function load(id: string) {
  try {
    return await getChat(id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof z.ZodError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (isPublicDemo()) return { title: 'Chat · Sourced' };
  const chat = await load((await params).chatId);
  return { title: `${chat.title} · Sourced` };
}

/** T-83 / D-142: a saved chat. */
export default async function ChatPage({ params }: Props) {
  const { chatId } = await params;
  // D-154: the hosted demo keeps chats in the visitor's tab, so the browser loads this one.
  if (isPublicDemo()) {
    if (!z.uuid().safeParse(chatId).success) notFound();
    return AskPage({ sessionChatId: chatId });
  }
  const chat = await load(chatId);
  return AskPage({ chat });
}
