/**
 * Next.js OpenTelemetry server-side instrumentation.
 * 
 * This file enables automatic instrumentation of Next.js server-side code,
 * creating nested spans for routes, API handlers, and server components.
 * 
 * Reference: https://nextjs.org/docs/pages/guides/open-telemetry
 */

export async function register() {
  // Only run on Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  // Debug: unbuffered write so Docker/local logs show (instrumentation may not run in standalone build)
  const line = `[DEBUG] Instrumentation register() running ${new Date().toISOString()}\n`;
  process.stdout.write(line);
  process.stderr.write(line);

  try {
    // Import server-side OpenTelemetry setup
    await import('./src/lib/otel-server');
  } catch (error) {
    console.error('[OTEL] Failed to initialize server-side OpenTelemetry:', error);
  }
}
