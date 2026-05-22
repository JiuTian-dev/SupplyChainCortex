/**
 * Next.js Instrumentation — server lifecycle hooks.
 *
 * Registers the background data refresh scheduler on server startup.
 * Only runs in Node.js runtime (not Edge).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('@/lib/scheduler');
    const { ensureCacheBackend } = await import('@/lib/cache');
    startScheduler();
    await ensureCacheBackend();
  }
}
