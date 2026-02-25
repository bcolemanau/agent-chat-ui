"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string) {
  return Boolean(s && UUID_RE.test(s));
}

/**
 * When on legacy /org/[orgName] or /org/[orgName]/project/[projectId], redirect to
 * canonical /org/[orgName]/[orgId] and /org/.../project/[projectName]/[projectId].
 * If project segment is a UUID (thread_id), resolve via projects list to get project_id (slug).
 */
export function LegacyOrgRedirect({
  orgId,
  children,
}: {
  orgId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname || typeof pathname !== "string") return;
    const segments = pathname.split("/").filter(Boolean);
    if (segments[0] !== "org" || segments[1] !== orgId) return;

    const slug = encodeURIComponent(orgId);
    const id = encodeURIComponent(orgId);

    if (segments[2] === "project" && segments[3]) {
      const segment = segments[3];

      if (isUuid(segment)) {
        (async () => {
          try {
            const orgContext = localStorage.getItem("reflexion_org_context");
            const headers: Record<string, string> = {};
            if (orgContext) headers["X-Organization-Context"] = orgContext;
            const res = await fetch("/api/projects", { headers });
            if (res.ok) {
              const projects = await res.json();
              const proj = projects.find((p: { thread_id?: string; id: string }) => p.thread_id === segment);
              if (proj) {
                const pslug = encodeURIComponent(proj.slug ?? proj.id);
                const pid = encodeURIComponent(proj.id);
                router.replace(`/org/${slug}/${id}/project/${pslug}/${pid}/map`);
                return;
              }
            }
          } catch {
            // fall through
          }
          const enc = encodeURIComponent(segment);
          router.replace(`/org/${slug}/${id}/project/${enc}/${enc}/map`);
        })();
        return;
      }
      const projectSlug = encodeURIComponent(segment);
      const projectIdEnc = encodeURIComponent(segment);
      router.replace(`/org/${slug}/${id}/project/${projectSlug}/${projectIdEnc}/map`);
      return;
    }
    router.replace(`/org/${slug}/${id}/map`);
  }, [pathname, orgId, router]);

  return <>{children}</>;
}
