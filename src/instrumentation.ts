/**
 * Next.js Instrumentation — server lifecycle hooks.
 *
 * - Initializes OpenTelemetry SDK (traces via OTLP) on server startup.
 * - Registers the background data refresh scheduler.
 * - Ensures the cache backend is ready.
 *
 * Only runs in Node.js runtime (not Edge).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize OpenTelemetry first so auto-instrumentation captures the
    // scheduler and downstream I/O.
    const { initOpenTelemetry } = await import('@/lib/audit/otel-sdk');
    try {
      initOpenTelemetry();
    } catch (err) {
      // OTel must never block server startup — log and continue.
      console.error('[instrumentation] OTel init failed:', err);
    }

    const { startScheduler } = await import('@/lib/scheduler');
    const { ensureCacheBackend } = await import('@/lib/cache');
    const { initEnginePersistence } = await import('@/lib/engine/persistence');
    
    startScheduler();
    await ensureCacheBackend();
    initEnginePersistence();
  }
}
