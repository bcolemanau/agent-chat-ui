"use client";

import React from "react";
import { viewRegistry } from "@/lib/view-registry";
import { SimulateBeatOverlay } from "./simulate-beat-overlay";

/** Register map content views (graph, artifacts, simulate). Called once when workbench loads. */
function registerMapViews() {
    viewRegistry.register("map", {
        label: "Map",
        render: (props) => props.graphContent ?? null,
    });

    viewRegistry.register("artifacts", {
        label: "Artifacts",
        render: (props) => props.artifactsContent ?? null,
    });

    /** Simulate = same force-directed graph as Map, with beat narrative overlay (no HeroDemo). Beat drives viz: step 1 = beat 0 = no edges. */
    viewRegistry.register("simulate", {
        label: "Simulate",
        render: (props) =>
            props.graphContent ? (
                <div className="relative h-full w-full">
                    {props.graphContent}
                    <SimulateBeatOverlay
                        beat={props.simulateBeat}
                        onBeatChange={props.onSimulateBeatChange}
                        playing={props.simulatePlaying}
                        onPlay={props.onSimulatePlay}
                        onPause={props.onSimulatePause}
                        onRestart={props.onSimulateRestart}
                    />
                </div>
            ) : null,
    });
}

registerMapViews();
