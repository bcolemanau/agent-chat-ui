"use client";

import React from "react";

/** DOM quirk when a portal (e.g. Radix SelectContent) is torn down; recoverable. */
function isRecoverablePortalError(error: Error | null): boolean {
    if (!error || typeof error.message !== "string") return false;
    const msg = error.message;
    if (!msg.includes("removeChild")) return false;
    // Browsers can report this as NotFoundError or DOMException; match by message.
    return (
        error.name === "NotFoundError" ||
        error.name === "DOMException" ||
        msg.includes("not a child of this node")
    );
}

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    /** Optional name for granular boundaries; logged in componentDidCatch to identify which boundary caught the error */
    name?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        const label = this.props.name ? `[ErrorBoundary: ${this.props.name}]` : "[ErrorBoundary]";
        if (isRecoverablePortalError(error)) {
            console.debug(`${label} Recoverable portal/removeChild error (ignoring):`, error.message);
            this.setState({ hasError: false, error: null });
            return;
        }
        console.error(`${label} Caught error:`, error, errorInfo);
        if (errorInfo?.componentStack) {
            console.error(`${label} Component stack:`, errorInfo.componentStack);
        }
    }

    render() {
        if (this.state.hasError && !isRecoverablePortalError(this.state.error)) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex min-h-screen items-center justify-center p-8 bg-background">
                    <div className="max-w-md rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-6 shadow-sm">
                        <h2 className="mb-2 text-lg font-semibold text-red-900 dark:text-red-200">
                            Something went wrong
                        </h2>
                        <p className="mb-4 text-sm text-red-700 dark:text-red-300">
                            {this.state.error?.message || "An unexpected error occurred"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    this.setState({ hasError: false, error: null });
                                }}
                                className="rounded border border-red-300 dark:border-red-700 bg-white dark:bg-red-900/50 px-4 py-2 text-sm font-medium text-red-800 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/70"
                            >
                                Try again
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    this.setState({ hasError: false, error: null });
                                    window.location.reload();
                                }}
                                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                            >
                                Reload page
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
