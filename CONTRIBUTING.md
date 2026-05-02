# Contributing to SupplyChain Cortex

## Quick Start

```bash
npm install
cp .env.example .env
npx prisma generate && npx prisma db push
npm run dev
```

## Development Workflow

1. **Pick an issue** — check the [Roadmap](README.md#roadmap) or open a new one
2. **Branch** — `feature/your-feature` or `fix/your-fix`
3. **Code** — follow existing patterns: TypeScript strict, Zod validation, Prisma queries in `lib/queries/`
4. **Test** — `npm test` (308 tests must pass)
5. **Type check** — `npx tsc --noEmit` (0 errors required)
6. **PR** — describe what changed and why

## Architecture Rules

- **Engine modules** go in `src/lib/engine/` — pure logic, no UI imports
- **Service functions** go in `src/lib/services/` — business logic with DB access
- **Query functions** go in `src/lib/queries/` — thin DB wrappers with caching
- **MCP tools** go in `src/lib/mcp/tools-*.ts` — one file per domain
- **Components** follow the existing directory structure

## Adding a New MCP Tool

1. Add the handler function in the relevant service/query module
2. Register the tool in the appropriate `src/lib/mcp/tools-*.ts` file
3. Re-export from the domain barrel if needed
4. Add a test that calls `executeTool('your_tool', {...})`

## Adding a New Engine Module

1. Create `src/lib/engine/your-module.ts`
2. Export from `src/lib/engine/index.ts`
3. Add unit tests in `src/lib/engine/your-module.test.ts`
4. If it needs an API, create `src/app/api/your-endpoint/route.ts`

## Testing

- **Unit tests**: `npm test` (Vitest, 308 tests)
- **E2E tests**: `npx playwright test` (7 tests, requires `npm run dev` running)
- **Type check**: `npx tsc --noEmit` (must be 0 errors)

## Code Style

- TypeScript strict mode
- No `any` without explicit comment
- Use Zod for API input validation
- Use Prisma for all DB access (no raw SQL)
- Components: `'use client'` only when needed
- Exports: named exports (no default exports except Next.js pages)

## Questions?

Open an issue or start a discussion.
