/**
 * Next.js OpenTelemetry server-side instrumentation.
 *
 * This file enables automatic instrumentation of Next.js server-side code,
 * creating nested spans for routes, API handlers, and server components.
 *
 * Reference: https://nextjs.org/docs/pages/guides/open-telemetry
 */

const UI_ENV_LOGGED = [
  'NODE_ENV',
  'NEXTAUTH_URL',
  'REFLEXION_JWT_SECRET',
  'NEXTAUTH_SECRET',
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_ASSISTANT_ID',
  'NEXT_PUBLIC_CLIENT_NAME',
  'NEXT_PUBLIC_ENABLE_RECORD',
  'NEXT_PUBLIC_LANGSMITH_API_KEY',
  'NEXT_PUBLIC_LANGSMITH_ENDPOINT',
  'NEXT_PUBLIC_LANGSMITH_PROJECT',
  'LANGGRAPH_API_URL',
  'AUTH_DEBUG',
  'PROXY_API_KEY',
  'PROJECT_DIFF_TIMEOUT_MS',
  'PRODUCT_GITHUB_TOKEN',
  'PRODUCT_GITHUB_REPO_NAME',
  'GITHUB_TOKEN',
  'GITHUB_REPO_NAME',
] as const;

const UI_ENV_SECRETS = new Set([
  'NEXTAUTH_SECRET',
  'REFLEXION_JWT_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
  'LANGSMITH_API_KEY',
  'PRODUCT_GITHUB_TOKEN',
  'GITHUB_TOKEN',
  'PROXY_API_KEY',
]);

function redact(key: string, value: string | undefined): string {
  if (value === undefined || value === '') return '<unset>';
  if (UI_ENV_SECRETS.has(key)) return value ? '<set>' : '<unset>';
  return value;
}

function validateAndLogEnv() {
  const out: string[] = [];
  out.push(`[ENV] UI server startup ${new Date().toISOString()}`);
  for (const key of UI_ENV_LOGGED) {
    const value = process.env[key];
    out.push(`[ENV] ${key}=${redact(key, value)}`);
  }
  const required = ['REFLEXION_JWT_SECRET', 'NEXTAUTH_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    out.push(`[ENV] WARN Missing recommended vars: ${missing.join(', ')}`);
  }
  const line = out.join('\n') + '\n';
  process.stdout.write(line);
  process.stderr.write(line);
}

export async function register() {
  // Only run on Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  validateAndLogEnv();
}
