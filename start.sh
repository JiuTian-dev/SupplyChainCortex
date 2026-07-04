#!/bin/bash
# SupplyChain Cortex — One-command start
# Requires: Docker, Bun (or Node.js 20+)

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SupplyChain Cortex v2.1"
echo "  AI Agent for Supply Chain Intelligence"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Check prerequisites ────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required. Install Docker Desktop."; exit 1; }
command -v bun >/dev/null 2>&1 || command -v npm >/dev/null 2>&1 || { echo "❌ Bun or Node.js is required."; exit 1; }

# ── 2. Start PostgreSQL ────────────────────────────────────────────────
echo "📦 Starting PostgreSQL..."
docker compose up -d postgres 2>/dev/null || docker start supply-chain-postgres 2>/dev/null || {
  echo "⚠️  Could not start PostgreSQL. If it's already running, ignore this."
}
echo "   Waiting for PostgreSQL..."
until docker exec supply-chain-postgres pg_isready -U supplychain 2>/dev/null; do
  sleep 1
done
echo "   ✓ PostgreSQL ready"

# ── 3. Setup .env if missing ───────────────────────────────────────────
if [ ! -f .env ]; then
  echo "📝 Creating .env from template..."
  cp .env.example .env
  echo "   ⚠️  Edit .env and add your DEEPSEEK_API_KEY"
  echo "   Get one at: https://platform.deepseek.com/api_keys"
fi

# ── 4. Install dependencies ────────────────────────────────────────────
if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies..."
  if command -v bun >/dev/null 2>&1; then
    bun install
  else
    npm install
  fi
fi

# ── 5. Push DB schema ──────────────────────────────────────────────────
echo "🗄️  Syncing database schema..."
if command -v bun >/dev/null 2>&1; then
  bun run db:push --skip-generate 2>/dev/null || bun run db:push 2>/dev/null || echo "   ⚠️  db:push skipped (DB may already be synced)"
else
  npm run db:push -- --skip-generate 2>/dev/null || npm run db:push 2>/dev/null || echo "   ⚠️  db:push skipped"
fi

# ── 6. Start dev server ────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 Starting SupplyChain Cortex"
echo "  Open: http://localhost:3000"
echo ""
echo "  Set your API key: Gear icon → API Key"
echo "  Try asking: 帮我做库存健康检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if command -v bun >/dev/null 2>&1; then
  bun run dev
else
  npm run dev
fi
