/* eslint-disable react-refresh/only-export-components -- file exports provider + useRecording */
"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";

interface RecordingContextType {
    isRecording: boolean;
    startRecording: () => void;
    stopRecording: () => void;
    downloadRecording: (name?: string) => void;
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

const ENABLE_RECORD = process.env.NEXT_PUBLIC_ENABLE_RECORD === "true";

export function RecordingProvider({ children }: { children: React.ReactNode }) {
    const [isRecording, setIsRecording] = useState(false);
    const events = useRef<any[]>([]);
    const stopFn = useRef<(() => void) | null>(null);

    const startRecording = async () => {
        if (!ENABLE_RECORD || isRecording) return;

        events.current = [];
        setIsRecording(true);

        // Dynamically import rrweb to avoid SSR issues
        const { record } = await import("rrweb");
        stopFn.current = record({
            emit(event: any) {
                events.current.push(event);
            },
        }) || null;

        console.log("Session recording started");
    };

    const stopRecording = () => {
        if (stopFn.current) {
            stopFn.current();
            stopFn.current = null;
        }
        setIsRecording(false);
        console.log("Session recording stopped. Captured events:", events.current.length);
    };

    const downloadRecording = (name = "reflexion-session") => {
        if (events.current.length === 0) {
            alert("No events captured to download.");
            return;
        }

        const data = JSON.stringify(events.current);
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name}-${new Date().toISOString()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Auto-cleanup on unmount
    useEffect(() => {
        return () => {
            if (stopFn.current) {
                stopFn.current();
            }
        };
    }, []);

    return (
        <RecordingContext.Provider value={{ isRecording, startRecording, stopRecording, downloadRecording }}>
            {children}
        </RecordingContext.Provider>
    );
}

export function useRecording() {
    const context = useContext(RecordingContext);
    if (context === undefined) {
        throw new Error("useRecording must be used within a RecordingProvider");
    }
    return context;
}
