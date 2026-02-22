/**
 * Decision types that conclude the phase (thread boundary). Mirrors backend kg_decision_pair.PHASE_CHANGE_DECISION_TYPES.
 * Used to show "Phase boundary" badge in Decisions panel when backend does not send is_phase_change (e.g. org fork rows).
 */
export const PHASE_CHANGE_DECISION_TYPES = new Set([
  "propose_project",
  "project_from_upload",
  "propose_organization",
  "organization_from_upload",
  "create_organization",
]);

export function isPhaseChangeDecisionType(type: string): boolean {
  return PHASE_CHANGE_DECISION_TYPES.has((type || "").trim());
}

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
