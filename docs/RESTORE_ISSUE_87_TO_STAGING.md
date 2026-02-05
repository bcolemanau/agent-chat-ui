# Restore issue-87 frontend work to staging (one merge)

The **default graph selector** and other issue-87 UI (edit organization, workflow strip org context, project selector fallback, admin role, backend-proxy fixes) live in **7 commits** on `feature/issue-87-internal-use` that were never merged into `staging`.

## Commits on `feature/issue-87-internal-use` not in `staging`

1. `39da83b` fix(build): restore backend-proxy, API routes use getBackendBaseUrl, client defaults from default-client-api-url  
2. `943b497` fix(proxy): use getBackendBaseUrl() in API routes, getDefaultClientApiUrl() for client defaults  
3. `7bfb6a9` fix: organization-management workbench updates  
4. `19dace2` feat(issue-87): workflow strip org context, project selector fallback, admin role  
5. `f921243` Issue 78: Decisions apply, map/artifacts UI, parallel ops header  
6. `3cc5459` Merge branch 'staging' of ... into feature/issue-52-agent-visibility  
7. `749e417` feat(#52): Map view search - filter nodes by id/name/type, graph-search-filter util  

## One-shot: merge issue-87 into staging

From **agent-chat-ui** repo:

```bash
git fetch origin
git checkout staging
git pull origin staging
git merge feature/issue-87-internal-use -m "Merge feature/issue-87-internal-use: org default graph selector, workbench updates, proxy fixes"
# Resolve any merge conflicts if prompted
git push origin staging
```

If you hit merge conflicts, fix them in the reported files, then:

```bash
git add .
git commit -m "Merge feature/issue-87-internal-use: resolve conflicts"
git push origin staging
```

After this, **remote staging** will have the edit-organization default graph selector and the rest of the issue-87 frontend work without redoing each file.
