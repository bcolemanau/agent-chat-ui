"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { Chords } from "d3-chord";
import { chord as d3Chord, ribbon as d3Ribbon } from "d3-chord";
import { polygonHull as d3PolygonHull } from "d3-polygon";

const BEAT_DURATION_MS = 5000;
const CAPTIONS: { script: string; outcome: string }[] = [
    { script: "We start with individual ideas and conversations…", outcome: "Chaos — no connection." },
    { script: "First, tribes form around individuals and they form group identity, language and tools.", outcome: "Tribes — but still no shared context at the seams." },
    { script: "Then we organize: first in a linear pipeline.", outcome: "One workflow — many seams." },
    { script: "Then in a loop around the customer.", outcome: "One place to connect." },
    { script: "Flows between phases become visible.", outcome: "Connections visible." },
    { script: "Market and technology forces wash over the organization creating opportunities, threats and more change…", outcome: "One decision — saved, traceable, in context." },
    { script: "Innovation is saying no to 1,000 things. (Steve Jobs)", outcome: "One place where your decisions have context." },
    { script: "OrchSync — what are you saying yes and no to today?", outcome: "OrchSync: one place where your decisions have context." },
];

interface DemoNode extends d3.SimulationNodeDatum {
    id: string;
    type: string;
    name?: string;
    label?: string;
    x?: number;
    y?: number;
    clusterIndex?: number;
}

interface DemoLink {
    source: string | DemoNode;
    target: string | DemoNode;
    type?: string;
}

interface GraphData {
    nodes: DemoNode[];
    links: DemoLink[];
    metadata: {
        entity_counts?: Record<string, number>;
        phase_grouping?: { agent_id: string; agent_name: string; types: string[] }[];
        link_type_counts?: Record<string, number>;
    };
}

function buildSyntheticGraph(): GraphData {
    const types = ["DOMAIN", "REQ", "ARTIFACT", "PERSONA", "SCENARIO", "REQUIREMENT"];
    const nodes: DemoNode[] = [];
    const links: DemoLink[] = [];
    const numNodes = 80;
    for (let i = 0; i < numNodes; i++) {
        const type = types[i % types.length];
        nodes.push({
            id: `n-${i}`,
            type,
            name: `${type}-${i}`,
        });
    }
    for (let i = 0; i < Math.min(60, numNodes - 1); i++) {
        links.push({
            source: `n-${i}`,
            target: `n-${(i + 1) % numNodes}`,
            type: "REFERENCES",
        });
    }
    const phase_grouping = [
        { agent_id: "supervisor", agent_name: "Supervisor", types: ["DOMAIN", "REQ"] },
        { agent_id: "concept", agent_name: "Concept", types: ["PERSONA", "SCENARIO", "ARTIFACT"] },
        { agent_id: "requirements", agent_name: "Requirements", types: ["REQUIREMENT"] },
    ];
    return {
        nodes,
        links,
        metadata: {
            entity_counts: types.reduce((acc, t) => ({ ...acc, [t]: Math.floor(numNodes / types.length) }), {}),
            phase_grouping,
        },
    };
}

function assignClusters(
    nodes: DemoNode[],
    phase_grouping: { agent_id: string; agent_name: string; types: string[] }[]
): void {
    const typeToCluster = new Map<string, number>();
    phase_grouping.forEach((pg, idx) => {
        pg.types.forEach((t) => typeToCluster.set(t, idx));
    });
    nodes.forEach((n) => {
        n.clusterIndex = typeToCluster.get(n.type) ?? 0;
    });
}

const TRANSITION_MS = 900;

export function HeroDemoScene() {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [graph, setGraph] = useState<GraphData | null>(null);
    const [dataSource, setDataSource] = useState<"kg" | "synthetic">("kg");
    const [beat, setBeat] = useState(0);
    const [playing, setPlaying] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const simulationRef = useRef<d3.Simulation<DemoNode, DemoLink> | null>(null);
    const lastPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
    const graphIdRef = useRef<string | null>(null);

    // Fetch base KG or use synthetic
    useEffect(() => {
        let cancelled = false;
        fetch("/api/demo/kg")
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
            .then((data: GraphData) => {
                if (cancelled || !data?.nodes?.length) return;
                const nodes = data.nodes.map((n) => ({
                    id: n.id,
                    type: n.type || "ARTIFACT",
                    name: n.name ?? n.label ?? n.id,
                }));
                const links = (data.links || []).map((l) => ({
                    source: typeof l.source === "object" && l.source && "id" in l.source ? (l.source as { id: string }).id : String(l.source),
                    target: typeof l.target === "object" && l.target && "id" in l.target ? (l.target as { id: string }).id : String(l.target),
                    type: l.type,
                }));
                const phase_grouping = data.metadata?.phase_grouping ?? [];
                assignClusters(nodes, phase_grouping);
                setDataSource("kg");
                setGraph({
                    nodes,
                    links: links as DemoLink[],
                    metadata: { ...data.metadata, phase_grouping },
                });
            })
            .catch(() => {
                if (!cancelled) {
                    setDataSource("synthetic");
                    const fallback = buildSyntheticGraph();
                    assignClusters(fallback.nodes, fallback.metadata.phase_grouping ?? []);
                    setGraph(fallback);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Beat auto-advance when playing
    useEffect(() => {
        if (!playing || beat >= CAPTIONS.length) {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            return;
        }
        timerRef.current = setTimeout(() => {
            setBeat((b) => (b + 1 >= CAPTIONS.length ? 0 : b + 1));
        }, BEAT_DURATION_MS);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [playing, beat]);

    const play = useCallback(() => setPlaying(true), []);
    const pause = useCallback(() => setPlaying(false), []);
    const restart = useCallback(() => {
        lastPositionsRef.current.clear();
        setBeat(0);
        setPlaying(true);
    }, []);

    // D3: render scene by beat
    useEffect(() => {
        if (!graph || !containerRef.current || !svgRef.current) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        const centerX = width / 2;
        const centerY = height / 2;
        const phase_grouping = graph.metadata?.phase_grouping ?? [];
        const numClusters = Math.max(1, phase_grouping.length);

        // Normalize links for D3 (source/target as node refs)
        const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
        const validLinks = graph.links.filter((l) => {
            const s = typeof l.source === "string" ? l.source : (l.source as DemoNode).id;
            const t = typeof l.target === "string" ? l.target : (l.target as DemoNode).id;
            return nodeById.has(s) && nodeById.has(t);
        });

        const svg = d3.select(svgRef.current);
        svg.attr("width", width).attr("height", height);
        const g = svg.select<SVGGElement>("g.scene").empty() ? svg.append("g").attr("class", "scene") : svg.select<SVGGElement>("g.scene");

        g.attr("transform", "translate(0,0) scale(1)");
        g.selectAll("*").remove();

        const nodes = graph.nodes.map((n) => ({ ...n }));
        const links = validLinks.map((l) => ({
            ...l,
            source: nodeById.get(typeof l.source === "string" ? l.source : (l.source as DemoNode).id)!,
            target: nodeById.get(typeof l.target === "string" ? l.target : (l.target as DemoNode).id)!,
        }));

        // Persist positions across beats so we can transition; clear when graph changes
        const graphKey = graph.nodes.map((n) => n.id).join(",");
        if (graphIdRef.current !== graphKey) {
            graphIdRef.current = graphKey;
            lastPositionsRef.current.clear();
        }
        const fromPositions = new Map(lastPositionsRef.current);

        // Initialize positions if missing (first time or no previous)
        nodes.forEach((n, i) => {
            const prev = fromPositions.get(n.id);
            if (prev) {
                n.x = prev.x;
                n.y = prev.y;
            } else if (n.x == null || n.y == null) {
                n.x = centerX + (Math.random() - 0.5) * width * 0.8;
                n.y = centerY + (Math.random() - 0.5) * height * 0.8;
            }
        });

        const radius = Math.min(width, height) * 0.35;
        const clusterCenters: [number, number][] = [];
        for (let i = 0; i < numClusters; i++) {
            const angle = (i / numClusters) * 2 * Math.PI - Math.PI / 2;
            clusterCenters.push([centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)]);
        }

        if (beat === 0) {
            // Chaos: same force-directed graph as map (link force from actual KG), links not drawn
            const sim = d3.forceSimulation<DemoNode>(nodes)
                .force("link", d3.forceLink<DemoNode, DemoLink>(links).id((d) => d.id).distance(120).strength(0.35))
                .force("charge", d3.forceManyBody().strength(-80))
                .force("center", d3.forceCenter(centerX, centerY))
                .force("x", d3.forceX(centerX).strength(0.02))
                .force("y", d3.forceY(centerY).strength(0.02));
            simulationRef.current = sim;
        } else if (beat === 1) {
            // Teams: star schema — one leader per tribe, satellites around leader (2×3 grid of tribes)
            const cols = 3;
            const rows = 2;
            const pad = Math.min(width, height) * 0.12;
            const stageW = (width - 2 * pad) / cols;
            const stageH = (height - 2 * pad) / rows;
            const tribeCenters: [number, number][] = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    tribeCenters.push([pad + (c + 0.5) * stageW, pad + (r + 0.5) * stageH]);
                }
            }
            const starRadius = Math.min(stageW, stageH) * 0.22;
            const byCluster = new Map<number, DemoNode[]>();
            nodes.forEach((n) => {
                const c = (n.clusterIndex ?? 0) % numClusters;
                if (!byCluster.has(c)) byCluster.set(c, []);
                byCluster.get(c)!.push(n);
            });
            byCluster.forEach((clusterNodes, c) => {
                const [cx, cy] = tribeCenters[c % tribeCenters.length];
                clusterNodes.forEach((n, i) => {
                    if (i === 0) {
                        n.x = cx;
                        n.y = cy;
                    } else {
                        const angle = ((i - 1) / Math.max(1, clusterNodes.length - 1)) * 2 * Math.PI - Math.PI / 2;
                        n.x = cx + starRadius * Math.cos(angle);
                        n.y = cy + starRadius * Math.sin(angle);
                    }
                    n.fx = n.x;
                    n.fy = n.y;
                });
            });
            simulationRef.current = null;
        } else if (beat === 2) {
            // Linear: breadcrumb-style strip — pills per stage with arrows between (like workflow strip)
            const pad = width * 0.06;
            const stripY = centerY;
            const stripH = Math.min(height * 0.2, 72);
            const arrowGap = 28;
            const totalPillWidth = width - 2 * pad - (numClusters - 1) * arrowGap;
            const pillW = totalPillWidth / numClusters;
            const pillH = stripH * 0.7;
            const byCluster = new Map<number, DemoNode[]>();
            nodes.forEach((n) => {
                const c = (n.clusterIndex ?? 0) % numClusters;
                if (!byCluster.has(c)) byCluster.set(c, []);
                byCluster.get(c)!.push(n);
            });
            byCluster.forEach((clusterNodes, c) => {
                const pillLeft = pad + c * (pillW + arrowGap);
                const pillCx = pillLeft + pillW / 2;
                const pillCy = stripY;
                const innerPad = 8;
                clusterNodes.forEach((n, i) => {
                    const cols = Math.max(1, Math.ceil(Math.sqrt(clusterNodes.length)));
                    const row = i % cols;
                    const col = Math.floor(i / cols);
                    const cellW = (pillW - 2 * innerPad) / cols;
                    const cellH = (pillH - 2 * innerPad) / Math.ceil(clusterNodes.length / cols);
                    const jitter = (i * 7) % 5 - 2;
                    const x = pillLeft + innerPad + (col + 0.5) * cellW + jitter;
                    const y = pillCy - pillH / 2 + innerPad + (row + 0.5) * cellH + (i % 3) - 1;
                    n.x = x;
                    n.y = y;
                    n.fx = x;
                    n.fy = y;
                });
            });
            simulationRef.current = null;
        } else if (beat === 3) {
            // Agile circle with hulls: customer at centre, nodes on circle by phase (arc per phase)
            const loopRadius = radius * 0.9;
            if (nodes.length > 0) {
                nodes[0].x = centerX;
                nodes[0].y = centerY;
                nodes[0].fx = centerX;
                nodes[0].fy = centerY;
            }
            const byClusterCircle = new Map<number, DemoNode[]>();
            nodes.forEach((n) => {
                const c = (n.clusterIndex ?? 0) % numClusters;
                if (!byClusterCircle.has(c)) byClusterCircle.set(c, []);
                byClusterCircle.get(c)!.push(n);
            });
            byClusterCircle.forEach((clusterNodes, c) => {
                const startAngle = (c / numClusters) * 2 * Math.PI - Math.PI / 2;
                const endAngle = ((c + 1) / numClusters) * 2 * Math.PI - Math.PI / 2;
                const onArc = clusterNodes.filter((n) => n !== nodes[0]);
                const nArc = onArc.length;
                onArc.forEach((n, i) => {
                    const angle = nArc <= 1 ? startAngle : startAngle + (i / (nArc - 1)) * (endAngle - startAngle);
                    n.x = centerX + loopRadius * Math.cos(angle);
                    n.y = centerY + loopRadius * Math.sin(angle);
                    n.fx = n.x;
                    n.fy = n.y;
                });
            });
            simulationRef.current = null;
        } else {
            // Beat 4, 5, 6, 7: same single circle (chord / forces / ricochets / zoom), customer at centre
            const loopRadius = radius * 0.9;
            if (nodes.length > 0) {
                nodes[0].x = centerX;
                nodes[0].y = centerY;
                nodes[0].fx = centerX;
                nodes[0].fy = centerY;
            }
            for (let i = 1; i < nodes.length; i++) {
                const angle = ((i - 1) / (nodes.length - 1)) * 2 * Math.PI - Math.PI / 2;
                nodes[i].x = centerX + loopRadius * Math.cos(angle);
                nodes[i].y = centerY + loopRadius * Math.sin(angle);
                nodes[i].fx = nodes[i].x;
                nodes[i].fy = nodes[i].y;
            }
            simulationRef.current = null;
        }

        // Persist current layout for next beat's "from" position
        nodes.forEach((n) => {
            if (n.x != null && n.y != null) lastPositionsRef.current.set(n.id, { x: n.x, y: n.y });
        });

        // Phase hulls (beats 1, 2, 3): convex hull per phase so tribes / pipeline / agile circle show as blobs
        const phaseColors = ["#94a3b8", "#0ea5e9", "#ec4899", "#eab308", "#64748b"];
        if (beat === 1 || beat === 2 || beat === 3) {
            const hullGroup = g.append("g").attr("class", "phase-hulls");
            for (let c = 0; c < numClusters; c++) {
                const points = nodes
                    .filter((n) => (n.clusterIndex ?? 0) % numClusters === c && n.x != null && n.y != null)
                    .map((n) => [n.x!, n.y!] as [number, number]);
                if (points.length >= 3) {
                    const hull = d3PolygonHull(points);
                    if (hull) {
                        const pathD = "M" + hull.map((p) => p.join(",")).join("L") + "Z";
                        hullGroup
                            .append("path")
                            .attr("d", pathD)
                            .attr("fill", phaseColors[c % phaseColors.length])
                            .attr("fill-opacity", 0.12)
                            .attr("stroke", phaseColors[c % phaseColors.length])
                            .attr("stroke-opacity", 0.35)
                            .attr("stroke-width", 1);
                    }
                }
            }
        }

        // Beat 2 (Linear): breadcrumb-style strip — container, pills, arrows (like workflow strip in shell)
        if (beat === 2) {
            const pad = width * 0.06;
            const stripY = centerY;
            const stripH = Math.min(height * 0.2, 72);
            const arrowGap = 28;
            const totalPillWidth = width - 2 * pad - (numClusters - 1) * arrowGap;
            const pillW = totalPillWidth / numClusters;
            const pillH = stripH * 0.7;
            const r = 6;
            const stripGroup = g.append("g").attr("class", "breadcrumb-strip");
            const stripLeft = pad;
            const stripWidth = width - 2 * pad;
            stripGroup
                .append("rect")
                .attr("x", stripLeft)
                .attr("y", stripY - stripH / 2)
                .attr("width", stripWidth)
                .attr("height", stripH)
                .attr("rx", 8)
                .attr("ry", 8)
                .attr("fill", "rgba(30, 41, 59, 0.6)")
                .attr("stroke", "rgba(100, 116, 139, 0.35)")
                .attr("stroke-width", 1);
            for (let c = 0; c < numClusters; c++) {
                const pillLeft = pad + c * (pillW + arrowGap);
                const pillCy = stripY;
                const hue = 217;
                const light = 28 + (c / Math.max(1, numClusters - 1)) * 18;
                stripGroup
                    .append("rect")
                    .attr("x", pillLeft + 4)
                    .attr("y", pillCy - pillH / 2)
                    .attr("width", pillW - 8)
                    .attr("height", pillH)
                    .attr("rx", r)
                    .attr("ry", r)
                    .attr("fill", `hsla(${hue}, 45%, ${light}%, 0.85)`)
                    .attr("stroke", `hsla(${hue}, 50%, 50%, 0.4)`)
                    .attr("stroke-width", 1);
                if (c < numClusters - 1) {
                    const arrowX = pillLeft + pillW + arrowGap / 2;
                    stripGroup
                        .append("text")
                        .attr("x", arrowX)
                        .attr("y", pillCy)
                        .attr("text-anchor", "middle")
                        .attr("dominant-baseline", "central")
                        .attr("fill", "rgba(148, 163, 184, 0.7)")
                        .attr("font-size", 14)
                        .attr("font-family", "system-ui, sans-serif")
                        .text("→");
                }
            }
        }

        // Beat 4 (Chord): chord diagram (arcs + ribbons) + customer in centre
        if (beat === 4) {
            const n = Math.max(2, numClusters);
            const matrix = Array.from({ length: n }, () => Array(n).fill(0));
            for (const l of links) {
                const src = l.source as DemoNode;
                const tgt = l.target as DemoNode;
                const i = (src.clusterIndex ?? 0) % n;
                const j = (tgt.clusterIndex ?? 0) % n;
                matrix[i][j] += 1;
            }
            const total = matrix.flat().reduce((a, b) => a + b, 0);
            if (total === 0) {
                for (let i = 0; i < n; i++) matrix[i][(i + 1) % n] = 1;
            }
            const chordRadius = Math.min(width, height) * 0.38;
            const innerRadius = chordRadius * 0.52;
            const chordLayout: Chords = d3Chord().padAngle(0.02)(matrix);
            const chordGroup = g.append("g").attr("class", "chord-agile").attr("transform", `translate(${centerX},${centerY})`);
            const arcGen = d3.arc<{ startAngle: number; endAngle: number; index: number }>()
                .innerRadius(innerRadius)
                .outerRadius(chordRadius);
            const ribbonGen = d3Ribbon().radius(innerRadius);
            const phaseColors = ["#94a3b8", "#0ea5e9", "#ec4899", "#eab308", "#64748b"];
            chordGroup
                .selectAll("path.ribbon")
                .data(chordLayout)
                .enter()
                .append("path")
                .attr("class", "ribbon")
                .attr("fill", (d) => phaseColors[d.source.index % phaseColors.length])
                .attr("fill-opacity", 0.45)
                .attr("stroke", "rgba(0,0,0,0.2)")
                .attr("stroke-width", 0.5)
                .attr("d", ribbonGen as (d: unknown) => string | null);
            chordGroup
                .selectAll("path.arc")
                .data(chordLayout.groups)
                .enter()
                .append("path")
                .attr("class", "arc")
                .attr("fill", (d) => phaseColors[d.index % phaseColors.length])
                .attr("fill-opacity", 0.25)
                .attr("stroke", (d) => phaseColors[d.index % phaseColors.length])
                .attr("stroke-opacity", 0.6)
                .attr("stroke-width", 1)
                .attr("d", arcGen as (d: unknown) => string | null);
            const centreRadius = chordRadius * 0.32;
            chordGroup.append("circle").attr("class", "chord-centre").attr("r", centreRadius).attr("fill", "rgba(15,23,42,0.9)").attr("stroke", "rgba(228,179,24,0.6)").attr("stroke-width", 2);
            chordGroup
                .append("text")
                .attr("class", "chord-centre-label")
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("fill", "rgba(228,179,24,0.95)")
                .attr("font-size", 14)
                .attr("font-weight", "600")
                .text("Customer");
        }

        // Beat 1 (Teams): star–satellite links (leader to each satellite per tribe); fade in after nodes move
        if (beat === 1) {
            const byCluster = new Map<number, DemoNode[]>();
            nodes.forEach((n) => {
                const c = (n.clusterIndex ?? 0) % numClusters;
                if (!byCluster.has(c)) byCluster.set(c, []);
                byCluster.get(c)!.push(n);
            });
            const starLinks: { source: DemoNode; target: DemoNode }[] = [];
            byCluster.forEach((clusterNodes) => {
                if (clusterNodes.length < 2) return;
                const leader = clusterNodes[0];
                for (let i = 1; i < clusterNodes.length; i++) {
                    starLinks.push({ source: leader, target: clusterNodes[i] });
                }
            });
            const linkGroup = g.append("g").attr("class", "links links-star").style("opacity", 0);
            linkGroup
                .selectAll("line")
                .data(starLinks)
                .enter()
                .append("line")
                .attr("stroke", "rgba(148, 163, 184, 0.5)")
                .attr("stroke-width", 1)
                .attr("x1", (d) => d.source.x ?? 0)
                .attr("y1", (d) => d.source.y ?? 0)
                .attr("x2", (d) => d.target.x ?? 0)
                .attr("y2", (d) => d.target.y ?? 0);
            linkGroup.transition().delay(TRANSITION_MS).duration(300).style("opacity", 1);
        }

        // Draw links only in beat 6 (Ricochets)
        if (beat >= 6 && links.length > 0) {
            const linkGroup = g.append("g").attr("class", "links");
            const linkEls = linkGroup
                .selectAll("line")
                .data(links.slice(0, Math.min(links.length, 80)))
                .enter()
                .append("line")
                .attr("stroke", "#64748b")
                .attr("stroke-opacity", 0.4)
                .attr("stroke-width", 1);
            const drawLinks = () => {
                linkEls
                    .attr("x1", (d) => (d.source as DemoNode).x ?? 0)
                    .attr("y1", (d) => (d.source as DemoNode).y ?? 0)
                    .attr("x2", (d) => (d.target as DemoNode).x ?? 0)
                    .attr("y2", (d) => (d.target as DemoNode).y ?? 0);
            };
            if (simulationRef.current) simulationRef.current.on("tick", drawLinks);
            else drawLinks();
        }

        // Nodes: customer = centre node (nodes[0]); saved decision = first ARTIFACT (highlight in Forces + Ricochets)
        const nodeGroup = g.append("g").attr("class", "nodes");
        const customerId = graph.nodes[0]?.id;
        const savedDecisionId = graph.nodes.find((n) => n.type === "ARTIFACT")?.id ?? graph.nodes[0]?.id;
        const showSavedHighlight = beat === 5 || beat === 6; // Forces and Ricochets
        const isZoomBeat = beat === 7; // Zoom to customer

        const nodeEls = nodeGroup
            .selectAll("circle")
            .data(nodes)
            .enter()
            .append("circle")
            .attr("r", (d) => (d.id === customerId && isZoomBeat ? 14 : d.id === savedDecisionId && showSavedHighlight ? 14 : 6))
            .attr("fill", (d) => {
                if (d.id === customerId && isZoomBeat) return "#E5B318";
                if (d.id === savedDecisionId && showSavedHighlight) return "#E5B318";
                const colors: Record<string, string> = {
                    DOMAIN: "#64748b",
                    REQ: "#fbbf24",
                    ARTIFACT: "#0ea5e9",
                    PERSONA: "#ec4899",
                    SCENARIO: "#ec4899",
                    REQUIREMENT: "#eab308",
                };
                return colors[d.type] ?? "#94a3b8";
            })
            .attr("stroke", (d) => (d.id === customerId && isZoomBeat) || (d.id === savedDecisionId && showSavedHighlight) ? "#fff" : "rgba(0,0,0,0.3)")
            .attr("stroke-width", (d) => (d.id === customerId && isZoomBeat) || (d.id === savedDecisionId && showSavedHighlight) ? 2 : 1)
            .attr("cx", (d) => {
                const from = fromPositions.get(d.id);
                return from?.x ?? d.x ?? centerX;
            })
            .attr("cy", (d) => {
                const from = fromPositions.get(d.id);
                return from?.y ?? d.y ?? centerY;
            })
            .style("filter", (d) => (d.id === customerId && isZoomBeat) || (d.id === savedDecisionId && showSavedHighlight) ? "drop-shadow(0 0 8px #E5B318)" : "none")
            .style("opacity", (d) => (beat === 4 ? 0 : isZoomBeat && d.id !== customerId ? 0.2 : 1));

        // Animate nodes from previous view to current layout (same KG moving through views)
        if (beat > 0) {
            nodeEls
                .transition()
                .duration(TRANSITION_MS)
                .ease(d3.easeCubicInOut)
                .attr("cx", (d) => d.x ?? centerX)
                .attr("cy", (d) => d.y ?? centerY);
        }

        const tick = () => {
            nodeEls.attr("cx", (d) => d.x ?? centerX).attr("cy", (d) => d.y ?? centerY);
            if (beat === 0) {
                nodes.forEach((n) => {
                    if (n.x != null && n.y != null) lastPositionsRef.current.set(n.id, { x: n.x, y: n.y });
                });
            }
            g.selectAll<SVGLineElement, { source: DemoNode; target: DemoNode }>("line").attr("x1", (d) => d.source.x ?? 0).attr("y1", (d) => d.source.y ?? 0).attr("x2", (d) => d.target.x ?? 0).attr("y2", (d) => d.target.y ?? 0);
        };
        if (simulationRef.current) {
            simulationRef.current.on("tick", tick);
            simulationRef.current.alpha(0.5).restart();
        }

        // Beat 8 (index 7): zoom to customer (centre node)
        if (beat === 7 && customerId) {
            const customer = nodes.find((n) => n.id === customerId);
            if (customer && (customer.x != null || customer.fx != null)) {
                const gx = customer.x ?? customer.fx ?? centerX;
                const gy = customer.y ?? customer.fy ?? centerY;
                const scale = 8;
                const tx = width / 2 - gx * scale;
                const ty = height / 2 - gy * scale;
                g.transition()
                    .duration(1200)
                    .ease(d3.easeCubicOut)
                    .attr("transform", `translate(${tx},${ty}) scale(${scale})`);
            }
        }

        // Beat 6 (index 5): market/technology forces overlay (expanding waves from left and right)
        if (beat === 5) {
            let overlay = svg.select<SVGGElement>("g.forces-overlay");
            if (overlay.empty()) overlay = svg.append("g").attr("class", "forces-overlay");
            overlay.selectAll("*").remove();
            const baseRadius = Math.min(width, height) * 0.35;
            const waveOrigins: { cx: number; cy: number }[] = [
                { cx: -width * 0.15, cy: height * 0.25 },
                { cx: width * 1.15, cy: height * 0.75 },
            ];
            waveOrigins.forEach((origin) => {
                [0, 600, 1200].forEach((delay, di) => {
                    const circle = overlay!.append("circle")
                        .attr("cx", origin.cx)
                        .attr("cy", origin.cy)
                        .attr("r", baseRadius * 0.4)
                        .attr("fill", "none")
                        .attr("stroke", "rgba(0, 242, 255, 0.6)")
                        .attr("stroke-width", 2 + di)
                        .style("opacity", 0);
                    circle
                        .transition().delay(delay).duration(2000)
                        .attr("r", baseRadius * 1.8)
                        .style("opacity", 0.7)
                        .transition().duration(1200)
                        .style("opacity", 0)
                        .remove();
                });
            });
        } else {
            svg.select("g.forces-overlay").remove();
        }

        return () => {
            simulationRef.current?.stop();
        };
    }, [graph, beat]);

    if (!graph) {
        return (
            <div className="flex h-full items-center justify-center text-white/60">
                Loading demo…
            </div>
        );
    }

    const cap = CAPTIONS[Math.min(beat, CAPTIONS.length - 1)] ?? CAPTIONS[0];

    return (
        <div ref={containerRef} className="relative h-full w-full">
            <svg ref={svgRef} className="absolute inset-0 h-full w-full" style={{ background: "#0a0a0f" }} />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-8">
                <p className="mb-1 text-sm text-white/90">{cap.script}</p>
                <p className="text-xs text-amber-400/90">{cap.outcome}</p>
            </div>
            <div className="absolute right-4 top-2 flex gap-2">
                <button
                    type="button"
                    onClick={play}
                    className="rounded bg-white/20 px-3 py-1 text-sm text-white hover:bg-white/30"
                >
                    Play
                </button>
                <button
                    type="button"
                    onClick={pause}
                    className="rounded bg-white/20 px-3 py-1 text-sm text-white hover:bg-white/30"
                >
                    Pause
                </button>
                <button
                    type="button"
                    onClick={restart}
                    className="rounded bg-white/20 px-3 py-1 text-sm text-white hover:bg-white/30"
                >
                    Restart
                </button>
            </div>
            <div className="absolute left-4 top-2 flex flex-col gap-0.5 text-xs text-white/50">
                <span>Beat {beat + 1} / {CAPTIONS.length}</span>
                <span className="text-white/40">
                    {dataSource === "kg" ? "Base NPD model" : "Synthetic data"}
                </span>
            </div>
        </div>
    );
}
