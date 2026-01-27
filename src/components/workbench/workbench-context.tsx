"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface Node {
  id: string;
  name: string;
  type: string;
  description?: string;
  properties?: Record<string, any>;
  metadata?: Record<string, any>;
  is_active?: boolean;
  diff_status?: 'added' | 'modified' | 'removed';
}

interface WorkbenchContextType {
  selectedNode: Node | null;
  setSelectedNode: (node: Node | null) => void;
}

const WorkbenchContext = createContext<WorkbenchContextType | undefined>(undefined);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  return (
    <WorkbenchContext.Provider value={{ selectedNode, setSelectedNode }}>
      {children}
    </WorkbenchContext.Provider>
  );
}

export function useWorkbenchContext() {
  const context = useContext(WorkbenchContext);
  if (context === undefined) {
    throw new Error("useWorkbenchContext must be used within a WorkbenchProvider");
  }
  return context;
}

export type { Node };
