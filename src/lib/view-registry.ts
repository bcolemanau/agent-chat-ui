"use client";

import type { ReactNode } from "react";

/**
 * Minimal graph shape shared between map and simulation (HeroDemoScene).
 * Compatible with WorldMapView GraphData and demo GraphData.
 */
export interface MapViewGraphData {
    nodes: Array<{ id: string; type?: string; name?: string; [key: string]: unknown }>;
    links: Array<{ source: string | object; target: string | object; type?: string; [key: string]: unknown }>;
    metadata: {
        phase_grouping?: { agent_id: string; agent_name: string; types: string[] }[];
        entity_counts?: Record<string, number>;
        link_type_counts?: Record<string, number>;
        customer_id?: string;
        thread_id?: string;
        [key: string]: unknown;
    };
}

export interface MapContentViewProps {
    data: MapViewGraphData | null;
    loading: boolean;
    error: string | null;
    containerRef: React.RefObject<HTMLDivElement | null>;
    scope?: { orgId?: string; projectId?: string; threadId?: string; phaseId?: string };
    /** When view is simulate: pass map's graph so simulate doesn't re-fetch. */
    initialGraphForSimulate?: MapViewGraphData | null;
    /** For map view: the graph SVG + loading/error + controls (provided by WorldMapView). */
    graphContent?: ReactNode;
    /** For artifacts view: ArtifactsListView wrapper (provided by WorldMapView). */
    artifactsContent?: ReactNode;
    /** Simulate view: beat (0..7) drives visualization; step 1 = beat 0 = no edges. */
    simulateBeat?: number;
    simulatePlaying?: boolean;
    onSimulateBeatChange?: (beat: number) => void;
    onSimulatePlay?: () => void;
    onSimulatePause?: () => void;
    onSimulateRestart?: () => void;
}

export interface MapContentViewDescriptor {
    id: string;
    label?: string;
    render: (props: MapContentViewProps) => ReactNode;
}

class ViewRegistry {
    private descriptors = new Map<string, MapContentViewDescriptor>();

    register(id: string, descriptor: Omit<MapContentViewDescriptor, "id">): void {
        this.descriptors.set(id, { ...descriptor, id });
    }

    get(id: string): MapContentViewDescriptor | undefined {
        return this.descriptors.get(id);
    }

    has(id: string): boolean {
        return this.descriptors.has(id);
    }

    getIds(): string[] {
        return Array.from(this.descriptors.keys());
    }
}

export const viewRegistry = new ViewRegistry();
