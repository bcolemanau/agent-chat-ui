"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as d3 from "d3";

const BEAT_DURATION_MS = 5000;
const CAPTIONS: { script: string; outcome: string }[] = [
    {
        script: "We start with the noise of the modern enterprise. Thousands of unlinked individuals, ideas and requirements.",
        outcome: "Chaos — no connection.",
    },
    {
        script: "First, tribes form — marketing, sales, product, engineering, delivery, service. Then we organize: first in a linear pipeline.",
        outcome: "Tribes and workflows — but still no shared context at the seams.",
    },
    {
        script: "Then in a loop around the customer.",
        outcome: "One place to connect.",
    },
    {
        script: "Decisions and discussions fly across the org — between people and between teams. Most are ephemeral. Few are captured.",
        outcome: "Decisions everywhere — but where do they live?",
    },
    {
        script: "We built it to protect this one thing. This decision was saved from the chaos.",
        outcome: "One decision — saved, traceable, in context.",
    },
    {
        script: "Innovation is saying no to 1,000 things. What are you saying yes and no to today?",
        outcome: "Reflexion: one place where your decisions have context.",
    },
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

export function HeroDemoScene() {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [graph, setGraph] = useState<GraphData | null>(null);
    const [beat, setBeat] = useState(0);
    const [playing, setPlaying] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const simulationRef = useRef<d3.Simulation<DemoNode, DemoLink> | null>(null);

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
                setGraph({
                    nodes,
                    links: links as DemoLink[],
                    metadata: { ...data.metadata, phase_grouping },
                });
            })
            .catch(() => {
                if (!cancelled) {
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

        // Initialize positions if missing
        nodes.forEach((n, i) => {
            if (n.x == null) n.x = centerX + (Math.random() - 0.5) * width * 0.8;
            if (n.y == null) n.y = centerY + (Math.random() - 0.5) * height * 0.8;
        });

        const radius = Math.min(width, height) * 0.35;
        const clusterCenters: [number, number][] = [];
        for (let i = 0; i < numClusters; i++) {
            const angle = (i / numClusters) * 2 * Math.PI - Math.PI / 2;
            clusterCenters.push([centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)]);
        }

        if (beat === 0) {
            // Chaos: weak force, no links
            const sim = d3.forceSimulation<DemoNode>(nodes)
                .force("charge", d3.forceManyBody().strength(-30))
                .force("center", d3.forceCenter(centerX, centerY))
                .force("x", d3.forceX(centerX).strength(0.02))
                .force("y", d3.forceY(centerY).strength(0.02));
            simulationRef.current = sim;
        } else if (beat === 1) {
            // Clusters: pull toward cluster centers via forceX/forceY
            const sim = d3.forceSimulation<DemoNode>(nodes)
                .force("charge", d3.forceManyBody().strength(-120))
                .force(
                    "x",
                    d3.forceX((d: DemoNode) => clusterCenters[(d.clusterIndex ?? 0) % clusterCenters.length][0]).strength(0.08)
                )
                .force(
                    "y",
                    d3.forceY((d: DemoNode) => clusterCenters[(d.clusterIndex ?? 0) % clusterCenters.length][1]).strength(0.08)
                );
            simulationRef.current = sim;
        } else if (beat === 2) {
            // Linear: left to right
            nodes.forEach((n, i) => {
                const idx = n.clusterIndex ?? 0;
                const seg = width / (numClusters + 1);
                const x = seg * (idx + 1);
                const y = centerY + ((i % 20) - 10) * 15;
                n.x = x;
                n.y = y;
                n.fx = x;
                n.fy = y;
            });
            simulationRef.current = null;
        } else if (beat === 3) {
            // Circular: customer at centre
            nodes.forEach((n, i) => {
                const idx = n.clusterIndex ?? 0;
                const angle = (idx / numClusters) * 2 * Math.PI + (i % 5) * 0.1;
                n.x = centerX + radius * Math.cos(angle);
                n.y = centerY + radius * Math.sin(angle);
                n.fx = n.x;
                n.fy = n.y;
            });
            if (nodes.length > 0) {
                nodes[0].x = centerX;
                nodes[0].y = centerY;
                nodes[0].fx = centerX;
                nodes[0].fy = centerY;
            }
            simulationRef.current = null;
        } else {
            // Beat 4, 5, 6: keep circular layout
            nodes.forEach((n, i) => {
                const idx = n.clusterIndex ?? 0;
                const angle = (idx / numClusters) * 2 * Math.PI + (i % 5) * 0.1;
                n.x = centerX + radius * Math.cos(angle);
                n.y = centerY + radius * Math.sin(angle);
                n.fx = n.x;
                n.fy = n.y;
            });
            if (nodes.length > 0) {
                nodes[0].x = centerX;
                nodes[0].y = centerY;
                nodes[0].fx = centerX;
                nodes[0].fy = centerY;
            }
            simulationRef.current = null;
        }

        // Draw links only from beat 3 onward (ricochets)
        if (beat >= 3 && links.length > 0) {
            const linkGroup = g.append("g").attr("class", "links");
            const linkEls = linkGroup
                .selectAll("line")
                .data(links.slice(0, Math.min(links.length, 80)))
                .enter()
                .append("line")
                .attr("stroke", "#64748b")
                .attr("stroke-opacity", beat === 3 ? 0.4 : 0.2)
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

        // Nodes
        const nodeGroup = g.append("g").attr("class", "nodes");
        const goldenId = graph.nodes.find((n) => n.type === "ARTIFACT")?.id ?? graph.nodes[0]?.id;

        const nodeEls = nodeGroup
            .selectAll("circle")
            .data(nodes)
            .enter()
            .append("circle")
            .attr("r", (d) => (d.id === goldenId && beat >= 4 ? 14 : 6))
            .attr("fill", (d) => {
                if (d.id === goldenId && beat >= 4) return "#E5B318";
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
            .attr("stroke", (d) => (d.id === goldenId && beat >= 4 ? "#fff" : "rgba(0,0,0,0.3)"))
            .attr("stroke-width", (d) => (d.id === goldenId && beat >= 4 ? 2 : 1))
            .attr("cx", (d) => d.x ?? centerX)
            .attr("cy", (d) => d.y ?? centerY)
            .style("filter", (d) => (d.id === goldenId && beat >= 4 ? "drop-shadow(0 0 8px #E5B318)" : "none"))
            .style("opacity", (d) => (beat === 6 && d.id !== goldenId ? 0.2 : 1));

        const tick = () => {
            nodeEls.attr("cx", (d) => d.x ?? centerX).attr("cy", (d) => d.y ?? centerY);
            g.selectAll<SVGLineElement, { source: DemoNode; target: DemoNode }>("line").attr("x1", (d) => d.source.x ?? 0).attr("y1", (d) => d.source.y ?? 0).attr("x2", (d) => d.target.x ?? 0).attr("y2", (d) => d.target.y ?? 0);
        };
        if (simulationRef.current) {
            simulationRef.current.on("tick", tick);
            simulationRef.current.alpha(0.5).restart();
        }

        // Beat 6: zoom to golden (transition the inner g transform)
        if (beat === 6 && goldenId) {
            const golden = nodes.find((n) => n.id === goldenId);
            if (golden && (golden.x != null || golden.fx != null)) {
                const gx = golden.x ?? golden.fx ?? centerX;
                const gy = golden.y ?? golden.fy ?? centerY;
                const scale = 8;
                const tx = width / 2 - gx * scale;
                const ty = height / 2 - gy * scale;
                g.transition()
                    .duration(1200)
                    .ease(d3.easeCubicOut)
                    .attr("transform", `translate(${tx},${ty}) scale(${scale})`);
            }
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
            <div className="absolute left-4 top-2 text-xs text-white/50">
                Beat {beat + 1} / {CAPTIONS.length}
            </div>
        </div>
    );
}
