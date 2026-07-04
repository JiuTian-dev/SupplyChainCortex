/**
 * Chat History Persistence API
 *
 * GET  /api/chat-history               — list all saved conversations
 * GET  /api/chat-history?id=xxx        — load a specific conversation
 * POST /api/chat-history               — save current conversation
 * DELETE /api/chat-history?id=xxx      — delete a conversation
 *
 * Backed by the `chat_conversations` table (see Prisma model ChatConversation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withErrorHandler } from '@/lib/api-utils';
import { optionalRequireAuth } from '@/lib/auth-helpers';
import { db } from '@/lib/db';

// Allow only alphanumeric characters, hyphens, and underscores.
// This blocks path traversal sequences (.., /, \) and any other
// characters that could be used to escape the history directory.
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

interface ChatMessage {
  role: string;
  content: string;
  timestamp: string;
}

/**
 * Validate that an id is safe to use as a conversation identifier.
 * Returns the sanitized id, or null if the id is invalid/dangerous.
 */
function validateId(id: string | null | undefined): string | null {
  if (!id) return null;
  // Reject empty strings and overly long ids (defensive upper bound).
  if (id.length === 0 || id.length > 128) return null;
  // Reject anything that doesn't match the safe pattern.
  if (!SAFE_ID_PATTERN.test(id)) return null;
  // Defense-in-depth: ensure no traversal sequence slipped through
  // (the regex already excludes '.', '/', '\', but be explicit).
  if (id.includes('..') || id.includes('/') || id.includes('\\')) return null;
  return id;
}

/**
 * Coerce a Prisma Json value into a ChatMessage array. Defensive: returns
 * an empty array when the stored value is missing or malformed.
 */
function toMessages(value: unknown): ChatMessage[] {
  return Array.isArray(value) ? (value as ChatMessage[]) : [];
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();

  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get('id');

  if (rawId !== null) {
    const id = validateId(rawId);
    if (!id) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const conversation = await db.chatConversation.findUnique({ where: { id } });
    if (!conversation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({
      id: conversation.id,
      title: conversation.title,
      messages: toMessages(conversation.messages),
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    });
  }

  // List all (without full messages)
  const conversations = await db.chatConversation.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json(conversations.map(c => ({
    id: c.id,
    title: c.title,
    messageCount: toMessages(c.messages).length,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  })));
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();

  const body = await request.json() as {
    id?: string;
    title?: string;
    messages: ChatMessage[];
  };

  // Validate any client-supplied id; fall back to a generated one if absent/invalid.
  const rawId = body.id ? validateId(body.id) : null;
  const id = rawId || `chat-${Date.now()}`;
  const title = body.title || `对话 ${new Date().toISOString().slice(0, 10)}`;
  const messages = body.messages.slice(-50); // max 50 messages

  await db.chatConversation.upsert({
    where: { id },
    create: {
      id,
      title,
      messages: messages as unknown as Prisma.InputJsonValue,
    },
    update: {
      title,
      messages: messages as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, id });
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  await optionalRequireAuth();

  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get('id');
  if (!rawId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const id = validateId(rawId);
  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // delete throws P2025 when the record is missing. Treat "not found" as
  // success to keep the API idempotent (matching the previous file-system
  // implementation which silently no-op'd on missing files).
  try {
    await db.chatConversation.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Error && (error as { code?: string }).code !== 'P2025') {
      throw error;
    }
  }

  return NextResponse.json({ success: true });
});
