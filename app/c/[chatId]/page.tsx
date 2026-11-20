import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AskPage } from '@/components/ask/AskPage';
import { z } from 'zod';
import { NotFoundError, getChat } from '@/lib/chats/store';
import { isPublicDemo } from '@/lib/kit/profile';

type Props = { params: Promise<{ chatId: string }> };

async function load(id: string) {
  if (isPublicDemo()) notFound();
  try {
    return await getChat(id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof z.ZodError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const chat = await load((await params).chatId);
  return { title: `${chat.title} · Sourced` };
}

/** T-83 / D-142: a saved chat. */
export default async function ChatPage({ params }: Props) {
  const chat = await load((await params).chatId);
  return AskPage({ chat });
}
