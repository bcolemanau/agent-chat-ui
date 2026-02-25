/**
 * Decorator-style API client: injects X-Organization-Context on every request from a
 * single source of truth (ref kept in sync by OrgContextRefProvider).
 * Use this instead of raw fetch() for org-scoped /api/* calls so the header is applied
 * consistently without each caller adding it.
 *
 * @see docs/ORG_CONTEXT_AND_HEADERS.md
 */

/** Set by OrgContextRefProvider. Read by apiFetch when building request headers. */
export const orgContextRef: { current: string | null } = { current: null };

const ORG_HEADER = "X-Organization-Context";

function mergeOrgHeader(init?: RequestInit): RequestInit {
  const orgId = orgContextRef.current;
  if (orgId == null || orgId === "") return init ?? {};

  const headers = new Headers(init?.headers);
  headers.set(ORG_HEADER, orgId);
  return { ...init, headers };
}

/**
 * Fetch that automatically adds X-Organization-Context when org context is set.
 * Same signature as fetch(); use for org-scoped API calls so the header is never forgotten.
 */
export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, mergeOrgHeader(init));
}
