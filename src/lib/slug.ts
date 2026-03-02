/**
 * URL-safe slug from display name. Must match backend reflexion_graph.slug.slug_from_name
 * for deterministic URLs. See DEVELOPER_EXPERIENCE_INTERFACES.md §2.6.
 */
export function slugFromName(name: string, fallback: "project" | "org" = "project"): string {
  if (!name || !String(name).trim()) return fallback;
  const s = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const trimmed = s.replace(/^-+|-+$/g, "");
  return trimmed || fallback;
}
