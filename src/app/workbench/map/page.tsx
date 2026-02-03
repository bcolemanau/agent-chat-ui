"use client";

import { useQueryState } from "nuqs";
import { WorldMapView } from "@/components/workbench/world-map-view";

export default function MapPage() {
    const [threadId] = useQueryState("threadId");
    return <WorldMapView key={threadId ?? "no-thread"} />;
}
