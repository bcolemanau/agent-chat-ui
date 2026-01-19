'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Search, Filter, Layers, RefreshCw, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/badge'; // Wait, Button is in ui/button, I used badge by mistake? 
import { Skeleton } from '@/components/ui/skeleton';

// Use actual components if they exist
import { Button as UIButton } from '@/components/ui/button';

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
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [data, setData] = useState<GraphData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);

            const orgContext = localStorage.getItem('reflexion_org_context');
            const headers: Record<string, string> = {};
            if (orgContext) {
                headers['X-Organization-Context'] = orgContext;
            }

            const res = await fetch('/api/kg-data', { headers });
            if (!res.ok) throw new Error('Failed to fetch graph data');
            const json = await res.json();
            setData(json);
        } catch (err: any) {
            console.error('Fetch error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

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
            .attr('fill', '#444');

        const nodes = data.nodes.map(d => ({ ...d }));
        const links = data.links.map(d => ({ ...d }));

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
            .attr('stroke', '#333')
            .attr('stroke-width', 1.5)
            .attr('marker-end', 'url(#arrowhead)');

        const node = g.append('g')
            .attr('class', 'nodes')
            .selectAll('.node')
            .data(nodes)
            .enter().append('g')
            .attr('class', 'node')
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
            .text(d => d.name)
            .attr('fill', '#ccc')
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

    }, [data]);

    return (
        <div className="h-full w-full flex flex-col bg-[#050505] overflow-hidden">
            {/* Toolbar */}
            <div className="h-12 border-b border-white/5 bg-white/[0.02] flex items-center justify-between px-4 z-20">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 bg-white/5 rounded-md p-1">
                        <UIButton variant="ghost" size="sm" className="h-7 text-xs px-3 bg-white/10 text-white">Full Map</UIButton>
                        <UIButton variant="ghost" size="sm" className="h-7 text-xs px-3 text-muted-foreground">Focus</UIButton>
                    </div>
                    <div className="h-4 w-px bg-white/10 ml-2" />
                    <UIButton variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-white" onClick={fetchData}>
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
                            className="bg-white/5 border border-white/10 rounded-md py-1 pl-8 pr-3 text-xs focus:outline-none focus:border-primary/50 transition-all w-48"
                        />
                    </div>
                </div>
            </div>

            {/* Canvas Area */}
            <div ref={containerRef} className="flex-1 relative overflow-hidden" onClick={() => setSelectedNode(null)}>
                {loading && !data && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#050505] z-30">
                        <div className="text-center">
                            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                            <p className="text-xs text-muted-foreground">Initializing Knowledge Graph...</p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#050505] z-30 p-6 text-center">
                        <div>
                            <p className="text-red-500 mb-4 font-mono text-sm leading-relaxed max-w-md mx-auto">Error: {error}</p>
                            <UIButton onClick={fetchData} variant="outline" className="border-zinc-800">Retry Connection</UIButton>
                        </div>
                    </div>
                )}

                <svg ref={svgRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

                {/* Selected Node Details */}
                {selectedNode && (
                    <div className="absolute top-4 right-4 w-72 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl p-5 z-20 shadow-2xl animate-in slide-in-from-right-4 duration-300">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
                                    {typeConfig[selectedNode.type]?.label || selectedNode.type}
                                </span>
                                <h3 className="text-lg font-bold text-white leading-tight">{selectedNode.name}</h3>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <p className="text-xs text-zinc-400 leading-relaxed">
                                {selectedNode.description || "No detailed description available for this node."}
                            </p>

                            {selectedNode.properties && (
                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Technical Specs</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        {Object.entries(selectedNode.properties).slice(0, 4).map(([k, v]: [any, any]) => (
                                            <div key={k} className="bg-white/5 rounded p-2">
                                                <div className="text-[9px] text-zinc-500 uppercase">{k}</div>
                                                <div className="text-[10px] text-zinc-300 truncate">{String(v)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <UIButton variant="outline" className="w-full text-[10px] h-8 border-zinc-800 bg-white/5 hover:bg-white/10">
                                View Detailed Methodology
                            </UIButton>
                        </div>
                    </div>
                )}

                {/* Floating Controls */}
                <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
                    <UIButton variant="outline" size="icon" className="w-9 h-9 bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-white rounded-lg backdrop-blur-md">
                        <ZoomIn className="h-4 w-4" />
                    </UIButton>
                    <UIButton variant="outline" size="icon" className="w-9 h-9 bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-white rounded-lg backdrop-blur-md">
                        <ZoomOut className="h-4 w-4" />
                    </UIButton>
                    <UIButton variant="outline" size="icon" className="w-9 h-9 bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-white rounded-lg backdrop-blur-md">
                        <Maximize className="h-4 w-4" />
                    </UIButton>
                </div>
            </div>
        </div>
    );
}
