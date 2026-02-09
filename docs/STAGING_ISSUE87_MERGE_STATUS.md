# Staging vs feature/issue-87-internal-use — Status & Merge Steps

## Current status (as of check)

- **origin/staging** already contains all of **feature/issue-87-internal-use** (merged via PR #24).
- `git log origin/staging..origin/feature/issue-87-internal-use` is **empty** → no commits on the feature branch are missing from staging.
- **origin/staging** has extra commits not on the feature branch: PR #24 merge, PR #23, #22, #21, and **Fix #70** (caf5a47 Merge feature/enhanced-kg (Fix #70) into staging).
- **Merge-base** of the two branches: `39da83b` (fix(build): restore backend-proxy, API routes use getBackendBaseUrl…).

**Conclusion:** No merge is required to get issue-87 into staging; it is already there. If you are on a different clone/remote or the feature branch was reset, use the steps below.

---

## The seven commits (issue-87 content)

These are the commits that form the issue-87 work. They are all included in **staging** via the PR #24 merge:

| Commit    | Description |
|----------|-------------|
| `39da83b` | fix(build): restore backend-proxy, API routes use getBackendBaseUrl, client defaults |
| `943b497` | fix(proxy): use getBackendBaseUrl() in API routes, getDefaultClientApiUrl() for client defaults |
| `7bfb6a9` | fix: organization-management workbench updates (default graph/workflow selector) |
| `19dace2` | feat(issue-87): workflow strip org context, project selector fallback, admin role |
| `f921243` | Issue 78: Decisions apply, map/artifacts UI, parallel ops header |
| `3cc5459` | Merge branch 'staging' into feature/issue-52-agent-visibility |
| `749e417` | feat(#52): Map view search - filter nodes by id/name/type, graph-search-filter util |

---

## Staging-only commit (not on feature branch)

- **Fix #70** — thread-summary API, approval-card and world-map-view workbench updates, Decisions/apply frontend, load pending from GET /decisions (merged as `caf5a47` into staging). This is only on **staging**, not on **feature/issue-87-internal-use**.

---

## Merge steps (if you need to re-merge or sync another remote)

From **agent-chat-ui** repo:

```bash
git fetch origin
git checkout staging
git pull origin staging
# Only if issue-87 is not already in staging:
git merge origin/feature/issue-87-internal-use -m "Merge feature/issue-87-internal-use: org default graph selector, workbench updates, proxy fixes"
# Resolve any merge conflicts if prompted, then:
# git add .
# git commit -m "Merge feature/issue-87-internal-use: resolve conflicts"
git push origin staging
```

To **update the feature branch** with staging (so it includes Fix #70):

```bash
git checkout feature/issue-87-internal-use
git pull origin staging
# Resolve conflicts if any
git push origin feature/issue-87-internal-use
```

---

*Generated from branch comparison; re-run `git fetch origin` and the same `git log` commands to refresh.*
