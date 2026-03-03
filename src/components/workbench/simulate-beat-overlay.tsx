"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_BEAT_CAPTIONS } from "@/components/demo/HeroDemoScene";

const BEAT_DURATION_MS = 5000;

export interface SimulateBeatOverlayProps {
    /** Controlled: current beat (0..7). When set, overlay drives graph visualization. */
    beat?: number;
    onBeatChange?: (beat: number) => void;
    playing?: boolean;
    onPlay?: () => void;
    onPause?: () => void;
    onRestart?: () => void;
}

/**
 * Overlay for Simulate view: same beat narrative (Play/Pause/Restart, captions) as HeroDemo,
 * but used on top of the map's force-directed graph so Simulate looks like the Map + beats.
 * When beat/onBeatChange etc. are provided (from WorldMapView), runs in controlled mode so
 * the graph can react (e.g. step 1 = beat 0 = no edges).
 */
export function SimulateBeatOverlay(props: SimulateBeatOverlayProps = {}) {
    const { beat: controlledBeat, onBeatChange, playing: controlledPlaying, onPlay, onPause, onRestart } = props;
    const isControlled = controlledBeat !== undefined && onBeatChange != null;

    const [internalBeat, setInternalBeat] = useState(0);
    const [internalPlaying, setInternalPlaying] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const beat = isControlled ? controlledBeat! : internalBeat;
    const playing = isControlled ? (controlledPlaying ?? false) : internalPlaying;
    const setBeat = isControlled ? onBeatChange! : setInternalBeat;
    const play = useCallback(() => (isControlled ? onPlay?.() : setInternalPlaying(true)), [isControlled, onPlay]);
    const pause = useCallback(() => (isControlled ? onPause?.() : setInternalPlaying(false)), [isControlled, onPause]);
    const restart = useCallback(() => {
        if (isControlled) onRestart?.(); else { setInternalBeat(0); setInternalPlaying(true); }
    }, [isControlled, onRestart]);

    useEffect(() => {
        if (!playing || beat >= DEMO_BEAT_CAPTIONS.length) {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            return;
        }
        timerRef.current = setTimeout(() => {
            setBeat(beat + 1 >= DEMO_BEAT_CAPTIONS.length ? 0 : beat + 1);
        }, BEAT_DURATION_MS);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [playing, beat, setBeat]);

    const cap = DEMO_BEAT_CAPTIONS[Math.min(beat, DEMO_BEAT_CAPTIONS.length - 1)] ?? DEMO_BEAT_CAPTIONS[0];

    return (
        <>
            <div className="absolute right-4 top-2 z-30 flex gap-2">
                <button
                    type="button"
                    onClick={play}
                    className="rounded bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm ring-1 ring-border hover:bg-background"
                >
                    Play
                </button>
                <button
                    type="button"
                    onClick={pause}
                    className="rounded bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm ring-1 ring-border hover:bg-background"
                >
                    Pause
                </button>
                <button
                    type="button"
                    onClick={restart}
                    className="rounded bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm ring-1 ring-border hover:bg-background"
                >
                    Restart
                </button>
            </div>
            <div className="absolute left-4 top-2 z-30 flex flex-col gap-0.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">
                    Beat {beat + 1} / {DEMO_BEAT_CAPTIONS.length}
                </span>
                <span className="text-muted-foreground/80">Knowledge graph + narrative</span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-background/95 to-transparent p-4 pt-8">
                <p className="mb-1 text-sm text-foreground/90">{cap.script}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400/90">{cap.outcome}</p>
            </div>
        </>
    );
}
