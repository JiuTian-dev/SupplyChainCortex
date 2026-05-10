/**
 * Chat History Persistence API
 *
 * GET  /api/chat-history               — list all saved conversations
 * GET  /api/chat-history?id=xxx        — load a specific conversation
 * POST /api/chat-history               — save current conversation
 * DELETE /api/chat-history?id=xxx      — delete a conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-utils';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const HISTORY_DIR = join(process.cwd(), '.chat-history');

interface StoredConversation {
  id: string;
  title: string;
  messages: Array<{ role: string; content: string; timestamp: string }>;
  createdAt: string;
  updatedAt: string;
}

function ensureDir() {
  if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });
}

function readAll(): StoredConversation[] {
  ensureDir();
  const files = readdirSafe(HISTORY_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try {
      return JSON.parse(readFileSync(join(HISTORY_DIR, f), 'utf-8'));
    } catch { return null; }
  }).filter(Boolean) as StoredConversation[];
}

function readdirSafe(dir: string): string[] {
  try {
    return require('fs').readdirSync(dir);
  } catch { return []; }
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const file = join(HISTORY_DIR, `${id}.json`);
    if (!existsSync(file)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(JSON.parse(readFileSync(file, 'utf-8')));
  }

  // List all (without full messages)
  const all = readAll();
  return NextResponse.json(all.map(c => ({
    id: c.id, title: c.title, messageCount: c.messages.length,
    createdAt: c.createdAt, updatedAt: c.updatedAt,
  })));
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const body = await request.json() as {
    id?: string;
    title?: string;
    messages: Array<{ role: string; content: string; timestamp: string }>;
  };

  const id = body.id || `chat-${Date.now()}`;
  const conversation: StoredConversation = {
    id,
    title: body.title || `对话 ${new Date().toISOString().slice(0, 10)}`,
    messages: body.messages.slice(-50), // max 50 messages
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  ensureDir();
  writeFileSync(join(HISTORY_DIR, `${id}.json`), JSON.stringify(conversation, null, 2), 'utf-8');

  return NextResponse.json({ success: true, id });
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const file = join(HISTORY_DIR, `${id}.json`);
  if (existsSync(file)) require('fs').unlinkSync(file);

  return NextResponse.json({ success: true });
});
