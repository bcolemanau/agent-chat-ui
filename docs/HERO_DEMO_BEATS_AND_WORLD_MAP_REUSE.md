# Hero Demo: Beats, KG Use, and World Map Reuse

This document is the source of truth for the Reflexion/OrchSync hero demo (8 beats, KG-driven) and how the same patterns feed into the **world map view**. We will iterate on the demo first, then push these ideas into the world map.

**Data source:** Base NPD model via `GET /kg/data/base` (or `/api/demo/kg`). Same shape as `GET /kg/data`: `nodes`, `links`, `metadata.entity_counts`, `metadata.phase_grouping`, `metadata.link_type_counts`.

---

## 1. Consolidated beats (8)

| # | Id | Script | Outcome | Current animation | Proposed animation | KG use |
|---|-----|--------|---------|-------------------|-------------------|--------|
| 1 | Chaos | We start with individual ideas and conversations… | Chaos — no connection. | ~80–200 dots, weak force sim, no links. Dim white/gray dots. | Same: dots only, no links, high entropy (weak force or Brownian). Optionally cap dot count from `nodes.length`. | **Nodes** as dots (id, type). Count from base KG or synthetic; no links shown. |
| 2 | Teams | First, tribes form around individuals and they form group identity, language and tools. | Tribes — but still no shared context at the seams. | forceX/forceY to cluster centres; no star links, no hulls. | Clusters around **leaders** (one “star” per tribe); **star–satellite links**; optional hulls. Tribe positions e.g. 2×3 grid. | **phase_grouping** → cluster centres and **tribe labels** (agent_name). **Node type** → cluster (clusterIndex). **Nodes** = dots; one node per cluster as “leader” (e.g. first of that type). |
| 3 | Linear | Then we organize: first in a linear pipeline. | One workflow — many seams. | Nodes positioned in horizontal bands by clusterIndex (left→right). | Same layout + **convex hulls** around each cluster; **labels** under each (Marketing, Sales, …). | **phase_grouping** order → left→right pipeline. **Nodes** by type/cluster; hulls from node positions. Labels from phase_grouping[].agent_name. |
| 4 | Agile | Then in a loop around the customer. | One place to connect. | Circular layout by cluster; **nodes[0]** fixed at centre as “customer”. | Same + **hulls** and **labels**; explicit **Customer** overlay (circle + label) at centre. | **Nodes** arranged in circle by clusterIndex; **one node** chosen as **customer** (e.g. centre node; could be a specific type or first node). Rest of graph unchanged. |
| 5 | Forces | Market and technology forces wash over the organization creating opportunities, threats and more change… | One decision — saved, traceable, in context. | Same as 4; one node (first ARTIFACT) highlighted golden; no waves. | **Market / technology waves**: expanding concentric circles from left/right; optional **force pulse** nudging nodes. **One decision** node highlighted (saved from chaos). Loop still visible. | **One node** = “saved decision” (e.g. first ARTIFACT or node with decision link). Future: **triggers** (DOMAIN_TRIGGER / trigger_id) drive wave origins or “forces” in the KG. |
| 6 | Ricochets | Innovation is saying no to 1,000 things. (Steve Jobs) | One place where your decisions have context. | Ephemeral **links** (up to 80) from KG; stroke opacity 0.2–0.4. | Same loop; **ricochets** = many ephemeral edges; **flow** animation (stroke-dasharray). | **Links** from base KG shown as ephemeral edges (optionally filtered by type). Node positions from current layout (loop). |
| 7 | Zoom | OrchSync — what are you saying yes and no to today? | OrchSync: one place where your decisions have context. | **Zoom to golden** (first ARTIFACT); others fade/shrink. | **Zoom to customer** (centre node); others blur/fade. End frame: customer centred, tagline. | **Customer** = same node as in beat 4 (centre). Zoom target is that node’s (x,y). No extra KG fields; reuse layout. |

---

## 2. KG use summary

| Beat | Main KG inputs | Notes |
|------|----------------|-------|
| 1 | `nodes` (count, id, type) | No links; optional cap from `nodes.length`. |
| 2–4 | `nodes`, `metadata.phase_grouping` | clusterIndex, cluster centres, labels (agent_name), customer = one chosen node. |
| 5 | One “saved decision” node; future: triggers | Highlight one node; waves are visual only today; later link to trigger_id / DOMAIN_TRIGGER. |
| 6 | `links` (source, target, type) | Ephemeral edges; optional filter by link type. |
| 7 | Customer node (same as beat 4) | Zoom to that node’s position; no new KG data. |

---

## 3. Reuse in world map view

If we implement the hero demo with shared patterns and the same KG contract, most of it can carry over into the **world map view** (`WorldMapView`). The demo is the “story” version; the map is the “workspace” version of the same model.

| Hero demo | World map reuse |
|-----------|------------------|
| **Clusters from phase_grouping** | Same: group nodes by type → phase/agent. Map already receives `phase_grouping` in metadata; use it the same way for layout and colour. |
| **Star (leader) per cluster** | One “anchor” or representative node per phase/cluster. Map can use it for focus, centring, or as the drag handle for the whole cluster. |
| **Star–satellite links** | Optional “structure” links (e.g. artifact → phase) alongside content links. Map already draws links; same link data, similar visual treatment. |
| **Convex hulls** | Hulls around clusters/phases so “tribes” are visible at a glance. Map doesn’t have hulls today; adding them in the demo gives a reusable pattern. |
| **Labels from phase_grouping** | Agent/phase names (Marketing, Sales, etc.). Map can show the same labels on or near each cluster. |
| **Customer / centre node** | In the demo it’s the zoom target. In the map it can be “current trigger” or “focus artifact” — same idea: one node as the narrative centre. |
| **Market/technology forces → triggers** | Demo: waves as visuals. Map: same KG concept (triggers, DOMAIN_TRIGGER) driving which part of the graph is “under pressure” or in focus. |
| **Zoom to a node** | Demo: zoom to customer. Map already has programmatic zoom (e.g. “focus node”); reuse the same zoom-to-node behaviour and D3 zoom logic. |
| **Base KG shape** | Demo and map both consume `nodes`, `links`, `entity_counts`, `phase_grouping`. One contract for both. |

### Doing it well so reuse is easy

- **Shared data shape:** Demo and map use the same API response (`/kg/data` and `/kg/data/base`). No one-off demo-only structure.
- **Shared layout/cluster logic:** One place that turns `phase_grouping` + `nodes` into cluster indices and (optionally) star nodes. Demo uses it for Teams/Linear/Agile; map uses it for “group by phase” or “show tribes”.
- **Shared D3 building blocks:** Hulls, star links, zoom-to-node, and (later) “force waves” or trigger emphasis as reusable helpers or small components. Demo and map both call into them with different styling or intensity.
- **Same “centre” notion:** In the demo it’s “customer”; in the map it’s “focus node” or “current trigger”. Same idea: one node id drives zoom and emphasis. If the KG later has an explicit “customer” or “trigger” flag, both can use it.

---

## 4. What’s in the Map view (pushed from this doc)

So that the demo and the Map feel like the same model, several ideas from this doc have been implemented in **WorldMapView** (the “Map” tab in the workbench). That’s intentional reuse, not accidental bleed:

- **Constellation layout** — Phase centres from `phase_grouping`; ART / anchor nodes can be fixed; other nodes are pulled toward their phase (or artifact) via `constellation-x` / `constellation-y` force. Same notion of “tribes” and structure as the demo.
- **Convex hulls** — One hull per phase/agent (via `d3-polygon`), so clusters are visible at a glance. Same hull pattern as in the demo (beats 2–4).
- **Same KG shape** — Map uses `/api/kg-data` (project/thread-scoped); demo uses `/api/demo/kg` (base NPD). Both use `nodes`, `links`, `metadata.phase_grouping` and the same force-directed simulation style.

If the Map view looks more “structured” (clusters, hulls) than a raw force graph, that’s from this reuse. The demo reuses the **actual KG** and the same kind of **force-directed graph** (Beat 1: link force drives layout even when links aren’t drawn) so continuity and movement carry across demo and map.

---

## 5. Workflow

1. **Iterate in the demo** — Implement and tune the 8 beats (narrative, visuals, KG use) in `HeroDemoScene` and `/demo` using the table above.
2. **Push to world map** — Extract shared layout, hull, zoom, and (optionally) force/trigger patterns into reusable pieces and adopt them in `WorldMapView`.

This doc will be updated as the demo and map evolve.
