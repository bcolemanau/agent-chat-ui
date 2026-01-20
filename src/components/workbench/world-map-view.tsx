'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Search, RefreshCw, ZoomIn, ZoomOut, Maximize, Activity, Globe, GitGraph, FileText } from 'lucide-react';
import { Button as UIButton } from '@/components/ui/button';
import { useStreamContext } from '@/providers/Stream';
import { useQueryState } from 'nuqs';
import { cn } from '@/lib/utils';

interface Node extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    type: string;
    is_active?: boolean;
    description?: string;
    properties?: any;
}

interface Link extends d3.SimulationLinkDatum<Node> {
    source: string | Node;
    target: string | Node;
    is_active?: boolean;
}

interface GraphData {
    nodes: Node[];
    links: Link[];
    metadata: {
        active_trigger?: string;
        customer_id: string;
        thread_id: string;
    };
}

const typeConfig: Record<string, { color: string; label: string }> = {
    DOMAIN: { color: '#64748b', label: 'Domain' },
    REQ: { color: '#fbbf24', label: 'Trigger' },
    ARTIFACT: { color: '#0ea5e9', label: 'Artifact' },
    MECH: { color: '#a855f7', label: 'Mechanism' },
    CRIT: { color: '#f43f5e', label: 'Risk' },
};

export function WorldMapView() {
    const stream = useStreamContext();
    const [viewMode, setViewMode] = useQueryState("view", { defaultValue: "map" });
    const visualizationHtml = (stream as any)?.values?.visualization_html;

    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [data, setData] = useState<GraphData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [threadId] = useQueryState("threadId");

    const [kgHistory, setKgHistory] = useState<{ versions: any[], total: number } | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [artifactHistory, setArtifactHistory] = useState<any[] | null>(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historicalContent, setHistoricalContent] = useState<string | null>(null);
    const [isFocusMode, setIsFocusMode] = useState(false);

    // Auto-toggle to workflow when a new visualization arrives
    useEffect(() => {
        if (visualizationHtml && viewMode !== 'workflow') {
            const timer = setTimeout(() => setViewMode('workflow'), 500);
            return () => clearTimeout(timer);
        }
    }, [visualizationHtml]);

    const fetchArtifactHistory = async (nodeId: string) => {
        try {
            setLoadingHistory(true);
            const orgContext = localStorage.getItem('reflexion_org_context');
            const headers: Record<string, string> = {};
            if (orgContext) headers['X-Organization-Context'] = orgContext;
            const url = threadId ? `/api/artifact/history?node_id=${nodeId}&thread_id=${threadId}` : `/api/artifact/history?node_id=${nodeId}`;
            const res = await fetch(url, { headers });
            if (res.ok) {
                const json = await res.json();
                setArtifactHistory(json.versions);
            }
        } catch (e) { console.error('Artifact history fetch error:', e); }
        finally { setLoadingHistory(false); }
    };

    const fetchHistoricalVersion = async (nodeId: string, version: string) => {
        try {
            const orgContext = localStorage.getItem('reflexion_org_context');
            const headers: Record<string, string> = {};
            if (orgContext) headers['X-Organization-Context'] = orgContext;
            const url = threadId
                ? `/api/artifact/content?node_id=${nodeId}&version=${version}&thread_id=${threadId}`
                : `/api/artifact/content?node_id=${nodeId}&version=${version}`;
            const res = await fetch(url, { headers });
            if (res.ok) {
                const json = await res.json();
                setHistoricalContent(json.content);
            }
        } catch (e) { console.error('Historical content fetch error:', e); }
    };

    useEffect(() => {
        if (selectedNode?.type === 'ARTIFACT') {
            fetchArtifactHistory(selectedNode.id);
            setHistoricalContent(null);
        } else {
            setArtifactHistory(null);
            setHistoricalContent(null);
        }
    }, [selectedNode]);

    const fetchKgHistory = async () => {
        try {
            const orgContext = localStorage.getItem('reflexion_org_context');
            const headers: Record<string, string> = {};
            if (orgContext) headers['X-Organization-Context'] = orgContext;
            const url = threadId ? `/api/project/history?thread_id=${threadId}` : '/api/project/history';
            const res = await fetch(url, { headers });
            if (res.ok) setKgHistory(await res.json());
        } catch (e) { console.error('History fetch error:', e); }
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            const orgContext = localStorage.getItem('reflexion_org_context');
            const headers: Record<string, string> = {};
            if (orgContext) headers['X-Organization-Context'] = orgContext;

            let url = threadId ? `/api/kg-data?thread_id=${threadId}` : '/api/kg-data';
            if (isFocusMode) {
                url += threadId ? `&focus=true` : `?focus=true`;
            }

            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error('Failed to fetch graph data');
            const json = await res.json();
            console.log('[WorldMapView] Fetched data:', {
                thread_id: json.metadata?.thread_id,
                node_count: json.nodes?.length,
                inactive_count: json.nodes?.filter((n: any) => n.is_active === false).length,
                active_count: json.nodes?.filter((n: any) => n.is_active === true).length,
                null_is_active: json.nodes?.filter((n: any) => n.is_active === undefined).length
            });
            setData(json);
            fetchKgHistory();
        } catch (err: any) {
            console.error('[WorldMapView] Fetch error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [threadId, isFocusMode]);

    useEffect(() => {
        if (!data || !svgRef.current || !containerRef.current) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const g = svg.append('g');

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 8])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        // Arrow marker
        svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '-0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .append('path')
            .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
            .attr('fill', '#888');

        const nodes = data.nodes.map(d => ({ ...d }));
        const links = data.links.map(d => ({ ...d }));

        console.log('[WorldMapView] Initializing Simulation with:', {
            node_count: nodes.length,
            inactive_nodes: nodes.filter(n => n.is_active === false).map(n => n.id)
        });

        const simulation = d3.forceSimulation<Node>(nodes)
            .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(150))
            .force('charge', d3.forceManyBody().strength(-800))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide().radius(60));

        const link = g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(links)
            .enter().append('line')
            .attr('stroke', '#888')
            .attr('stroke-width', 1.5)
            .attr('marker-end', 'url(#arrowhead)')
            .style('opacity', d => d.is_active === false ? 0.05 : 0.5);

        const node = g.append('g')
            .attr('class', 'nodes')
            .selectAll('.node')
            .data(nodes)
            .enter().append('g')
            .attr('class', 'node')
            .style('opacity', d => d.is_active === false ? 0.15 : 1)
            .style('filter', d => d.is_active === false ? 'grayscale(1) blur(1px)' : 'none')
            .on('click', (event, d) => {
                setSelectedNode(d);
                event.stopPropagation();
            })
            .call(d3.drag<SVGGElement, Node>()
                .on('start', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }) as any);

        node.append('circle')
            .attr('r', d => d.id === data.metadata.active_trigger ? 18 : 12)
            .attr('fill', d => typeConfig[d.type]?.color || '#444')
            .attr('stroke', d => d.id === data.metadata.active_trigger ? '#fff' : '#000')
            .attr('stroke-width', d => d.id === data.metadata.active_trigger ? 3 : 1)
            .style('filter', d => d.id === data.metadata.active_trigger ? 'drop-shadow(0 0 8px #fbbf24)' : 'none');

        node.append('text')
            .attr('dx', 16)
            .attr('dy', 4)
            .text(d => `${d.name}${d.is_active === false ? ' (inactive)' : ''}`)
            .attr('fill', d => d.is_active === false ? '#94a3b8' : 'gray')
            .style('font-size', '10px')
            .style('font-weight', '500')
            .style('pointer-events', 'none');

        simulation.on('tick', () => {
            link
                .attr('x1', d => (d.source as Node).x!)
                .attr('y1', d => (d.source as Node).y!)
                .attr('x2', d => (d.target as Node).x!)
                .attr('y2', d => (d.target as Node).y!);

            node
                .attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // Initial zoom to fit
        setTimeout(() => {
            const bounds = (g.node() as SVGGElement).getBBox();
            const fullWidth = width;
            const fullHeight = height;
            const midX = bounds.x + bounds.width / 2;
            const midY = bounds.y + bounds.height / 2;
            if (bounds.width === 0 || bounds.height === 0) return;

            const scale = 0.8 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight);
            svg.transition().duration(750).call(
                zoom.transform,
                d3.zoomIdentity.translate(fullWidth / 2, fullHeight / 2).scale(scale).translate(-midX, -midY)
            );
        }, 500);

    }, [data, viewMode]);

    // Artifacts View Component
    const ArtifactsView = () => {
        const artifacts = data?.nodes.filter(n => n.type === 'ARTIFACT') || [];

        return (
            <div className="absolute inset-0 flex flex-col bg-background p-6 overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {artifacts.length > 0 ? (
                        artifacts.map(artifact => (
                            <div key={artifact.id} className="border border-border rounded-lg p-4 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => setSelectedNode(artifact)}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-blue-500" />
                                        <h3 className="font-semibold text-sm truncate max-w-[120px]">{artifact.name}</h3>
                                    </div>
                                    {artifact.properties?.versions > 0 && (
                                        <span className="text-[10px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-medium">
                                            v{artifact.properties.versions + 1}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                    {artifact.description || "No description available."}
                                </p>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full flex flex-col items-center justify-center text-muted-foreground py-12">
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <FileText className="w-6 h-6 opacity-20" />
                            </div>
                            <p>No artifacts found in this project.</p>
                        </div>
                    )}
                </div>
                <div className="absolute bottom-6 left-6 z-20 pointer-events-none">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-background/80 backdrop-blur-md border border-border rounded-full shadow-lg">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Artifacts View</span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="h-full w-full flex flex-col bg-background overflow-hidden">
            {/* Toolbar */}
            <div className="h-12 border-b border-border bg-muted/30 flex items-center justify-between px-4 z-20">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 bg-muted rounded-md p-1">
                        <UIButton
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "h-7 text-xs px-3 transition-all",
                                !isFocusMode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => setIsFocusMode(false)}
                        >
                            Full Map
                        </UIButton>
                        <UIButton
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "h-7 text-xs px-3 transition-all",
                                isFocusMode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => setIsFocusMode(true)}
                        >
                            Focus
                        </UIButton>
                    </div>
                    {kgHistory && (
                        <div className="flex items-center gap-2 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-md">
                            <span className="text-[10px] font-bold text-blue-500 tracking-wider">KG v{kgHistory.total}</span>
                        </div>
                    )}
                    <div className="h-4 w-px bg-border ml-2" />
                    <UIButton variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={fetchData}>
                        <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                        <span className="text-xs">Refresh</span>
                    </UIButton>
                </div>
                <div className="flex items-center gap-2">
                    {data?.metadata.active_trigger && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full">
                            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">Active Trigger: {data.metadata.active_trigger}</span>
                        </div>
                    )}
                    <div className="relative">
                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            placeholder="Search nodes..."
                            className="bg-muted border border-border rounded-md py-1 pl-8 pr-3 text-xs focus:outline-none focus:border-primary/50 transition-all w-48 text-foreground"
                        />
                    </div>
                </div>
            </div>

            {/* Canvas Area */}
            <div ref={containerRef} className="flex-1 relative overflow-hidden" onClick={() => setSelectedNode(null)}>
                {viewMode === 'workflow' ? (
                    <div className="absolute inset-0 flex flex-col bg-background">
                        {!visualizationHtml ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4">
                                <Activity className="w-12 h-12 opacity-20" />
                                <div className="text-center">
                                    <h3 className="text-sm font-medium text-foreground">No active orientation</h3>
                                    <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">Ask the agent to "show orientation" to see the project workflow here.</p>
                                </div>
                                <UIButton
                                    variant="outline"
                                    size="sm"
                                    className="mt-4 border-border text-xs"
                                    onClick={() => setViewMode('map')}
                                >
                                    Switch to Map View
                                </UIButton>
                            </div>
                        ) : (
                            <iframe
                                srcDoc={`
                                    <html>
                                        <head>
                                            <style>
                                                body { margin: 0; background: transparent; color: inherit; font-family: sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; }
                                            </style>
                                        </head>
                                        <body>
                                            ${visualizationHtml}
                                        </body>
                                    </html>
                                `}
                                className="w-full h-full border-none"
                                title="Workflow Orientation"
                            />
                        )}
                        <div className="absolute bottom-6 left-6 z-20">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-background/80 backdrop-blur-md border border-border rounded-full shadow-lg">
                                <GitGraph className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Workflow State Mode</span>
                            </div>
                        </div>
                    </div>
                ) : viewMode === 'artifacts' ? (
                    <ArtifactsView />
                ) : (
                    <>
                        {loading && !data && (
                            <div className="absolute inset-0 flex items-center justify-center bg-background z-30">
                                <div className="text-center">
                                    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                    <p className="text-xs text-muted-foreground">Initializing Knowledge Graph...</p>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="absolute inset-0 flex items-center justify-center bg-background z-30 p-6 text-center">
                                <div>
                                    <p className="text-destructive mb-4 font-mono text-sm leading-relaxed max-w-md mx-auto">Error: {error}</p>
                                    <UIButton onClick={fetchData} variant="outline" className="border-border">Retry Connection</UIButton>
                                </div>
                            </div>
                        )}

                        <svg ref={svgRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

                        <div className="absolute bottom-6 left-6 z-20">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-background/80 backdrop-blur-md border border-border rounded-full shadow-lg">
                                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Knowledge Graph Mode</span>
                            </div>
                        </div>
                    </>
                )}

                {/* Selected Node Details */}
                {selectedNode && (
                    <div className="absolute top-4 right-4 w-80 bg-background/90 backdrop-blur-md border border-border rounded-xl p-5 z-20 shadow-2xl animate-in slide-in-from-right-4 duration-300 max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
                                    {typeConfig[selectedNode.type]?.label || selectedNode.type}
                                </span>
                                <h3 className="text-lg font-bold text-foreground leading-tight">{selectedNode.name}</h3>
                            </div>
                            <UIButton variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedNode(null)}>
                                <ZoomOut className="h-3.5 w-3.5" />
                            </UIButton>
                        </div>

                        <div className="space-y-4">
                            {!historicalContent ? (
                                <>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {selectedNode.description || "No detailed description available for this node."}
                                    </p>

                                    {selectedNode.properties && (
                                        <div className="space-y-2">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Technical Specs</span>
                                            <div className="grid grid-cols-2 gap-2">
                                                {Object.entries(selectedNode.properties).slice(0, 4).map(([k, v]: [any, any]) => (
                                                    <div key={k} className="bg-muted rounded p-2">
                                                        <div className="text-[9px] text-muted-foreground uppercase">{k}</div>
                                                        <div className="text-[10px] text-foreground truncate">{String(v)}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {selectedNode.type === 'ARTIFACT' && artifactHistory && artifactHistory.length > 0 && (
                                        <div className="space-y-3 pt-4 border-t border-border">
                                            <div className="flex items-center gap-2">
                                                <Activity className="w-3 h-3 text-blue-500" />
                                                <span className="text-[10px] font-bold text-muted-foreground uppercase">Version History</span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {artifactHistory.map((v: any) => (
                                                    <div
                                                        key={v.id}
                                                        className="flex items-center justify-between p-2 rounded bg-muted/30 hover:bg-muted transition-colors cursor-pointer group"
                                                        onClick={() => fetchHistoricalVersion(selectedNode.id, v.id)}
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-medium text-foreground">{v.id}</span>
                                                            <span className="text-[9px] text-muted-foreground">{v.timestamp}</span>
                                                        </div>
                                                        <UIButton variant="ghost" size="sm" className="h-6 px-2 text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">
                                                            View
                                                        </UIButton>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-blue-500 uppercase">Historical Preview</span>
                                        <UIButton variant="ghost" size="sm" className="h-6 text-[9px]" onClick={() => setHistoricalContent(null)}>
                                            Back to Current
                                        </UIButton>
                                    </div>
                                    <div className="bg-muted/50 rounded-lg p-3 border border-border">
                                        <div className="prose prose-invert prose-xs max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-[11px] font-mono leading-relaxed">
                                            {historicalContent}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <UIButton variant="outline" className="w-full text-[10px] h-8 border-border bg-muted/50 hover:bg-muted">
                                View Detailed Methodology
                            </UIButton>
                        </div>
                    </div>
                )}

                {/* Floating Controls */}
                <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
                    <UIButton variant="outline" size="icon" className="w-9 h-9 bg-background/50 border-border text-muted-foreground hover:text-foreground rounded-lg backdrop-blur-md">
                        <ZoomIn className="h-4 w-4" />
                    </UIButton>
                    <UIButton variant="outline" size="icon" className="w-9 h-9 bg-background/50 border-border text-muted-foreground hover:text-foreground rounded-lg backdrop-blur-md">
                        <ZoomOut className="h-4 w-4" />
                    </UIButton>
                    <UIButton variant="outline" size="icon" className="w-9 h-9 bg-background/50 border-border text-muted-foreground hover:text-foreground rounded-lg backdrop-blur-md">
                        <Maximize className="h-4 w-4" />
                    </UIButton>
                </div>
            </div>
        </div>
    );
}
