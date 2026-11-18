// src/instrumentation.ts
// Next.js instrumentation hook — runs once at server startup in the Node.js runtime.
// This is the correct place to initialise singletons such as the background job
// workers, because it fires before any request handler is invoked.
//
// Docs: node_modules/next/dist/docs/

export async function register() {
  // Only run in the Node.js runtime (not Edge).
  if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
    // Import workers module — the import itself calls initializeJobWorkers().
    await import('@/modules/jobs/workers');
  }
}
