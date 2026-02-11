/**
 * Schema-driven phase inference for decisions.
 * Mirrors backend decisions_loader._ORG_PHASE_TYPES for sync fallback when
 * GET /config/decision-types hasn't loaded yet. Single source of truth is backend;
 * this is used only before config fetch or when API is unavailable.
 */
export const DEFAULT_ORG_PHASE_TYPES = new Set([
  "create_organization",
  "organization_from_upload",
  "propose_organization",
  "add_user",
  "update_user_roles",
  "remove_user",
  "propose_user_add",
  "propose_user_edit",
  "propose_user_remove",
  "organization_onboarding",
]);

export function inferPhaseFromType(
  type: string,
  orgPhaseTypes?: Set<string> | string[]
): "Organization" | "Project" {
  const t = (type || "").trim();
  const types = orgPhaseTypes ?? DEFAULT_ORG_PHASE_TYPES;
  const set = types instanceof Set ? types : new Set(types);
  return set.has(t) ? "Organization" : "Project";
}
