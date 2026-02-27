"use client";

import { HeroDemoScene } from "@/components/demo/HeroDemoScene";

export default function DemoPage() {
    return (
        <div className="fixed inset-0 flex flex-col bg-[#0a0a0f]">
            <header className="flex shrink-0 items-center justify-between px-4 py-2 text-sm text-white/80">
                <span className="font-medium">Reflexion</span>
                <span className="text-white/50">Hero demo</span>
            </header>
            <main className="flex-1 min-h-0">
                <HeroDemoScene />
            </main>
        </div>
    );
}
