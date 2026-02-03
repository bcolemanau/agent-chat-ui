/**
 * Standardized diff interface types for semantic diff views.
 * 
 * These types define the contract between backend and frontend for diff visualization.
 * Backend adapters convert domain-specific data to these standardized formats.
 */

export type DiffType = 'subset' | 'progression' | 'similarity';

export interface DiffStats {
  totalLeft: number;
  totalRight: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
  completionPercentage?: number; // For progression diffs
}

export interface DiffResult<T = any> {
  added: T[];
  removed: T[];
  modified: Array<{left: T; right: T}>;
  unchanged: T[];
}

export interface SemanticDiff<T = any> {
  type: DiffType;
  left: T;
  right: T;
  diff: DiffResult<T> | any; // Flexible - can be nested for complex types
  stats: DiffStats;
  metadata: {
    title: string;
    leftLabel: string;
    rightLabel: string;
    description?: string;
    // Type-specific metadata
    subset?: {
      reductionPercentage: number;
      activeCount: number;
      inactiveCount: number;
    };
    progression?: {
      completionPercentage: number;
      itemsAdded: number;
      itemsRemaining: number;
      direction: 'forward' | 'backward';
    };
    similarity?: {
      similarityScore: number;
      complianceScores: {left: number; right: number};
      validationStatus: {left: boolean; right: boolean};
    };
  };
}

// Type-specific data structures

export interface ContextFile {
  name: string;
  path: string;
}

export interface ProjectConfigurationDiffData {
  artifacts: string[];
  external_context: ContextFile[];
}

export interface ProjectConfigurationDiffView {
  type: 'progression';
  progress_diff: SemanticDiff<ProjectConfigurationDiffData>;
  remaining_diff: SemanticDiff<ProjectConfigurationDiffData>;
  metadata: {
    title: string;
    description: string;
    completion_percentage: number;
    artifacts: {
      completed: number;
      total: number;
      remaining: number;
    };
    external_context: {
      completed: number;
      total: number;
      remaining: number;
    };
  };
}

/** @deprecated Use ProjectConfigurationDiffData */
export type HydrationDiffData = ProjectConfigurationDiffData;

/** @deprecated Use ProjectConfigurationDiffView */
export type HydrationDiffView = ProjectConfigurationDiffView;

// Graph diff types (for future classify_intent)
export interface Node {
  id: string;
  name: string;
  type: string;
  is_active?: boolean;
  [key: string]: any;
}

export interface Link {
  source: string | Node;
  target: string | Node;
  type?: string;
  [key: string]: any;
}

export interface GraphDiffData {
  nodes: Node[];
  links: Link[];
}

// Concept brief diff types (for generate_concept_brief approval view)
export interface Section {
  name: string;
  level: number;
  content: string;
}

export interface Field {
  name: string;
  value: string;
}

export interface ConceptBriefDiffData {
  sections: Section[];
  fields: Field[];
}

/** Option summary from backend for similarity diff (generate_concept_brief) */
export interface ConceptBriefOptionSummary {
  index: number;
  summary: string;
  compliance_score: number;
  validation: Record<string, unknown>;
  /** When present, draft was saved to storage; user can click through to view full content */
  artifact_id?: string;
}

/** View payload for concept brief options approval (similarity diff) */
export interface ConceptBriefDiffView {
  type: 'similarity';
  options: ConceptBriefOptionSummary[];
  recommended_index: number;
  metadata: {
    title: string;
    description: string;
    cache_key: string;
    num_options: number;
    similarity?: {
      similarityScore: number;
      complianceScores: Record<string, number>;
      validationStatus: Record<string, boolean>;
    };
  };
}

/** View payload for classify_intent approval (subset diff) */
export interface ClassifyIntentDiffView {
  type: 'subset';
  left: GraphDiffData;
  right: GraphDiffData;
  diff: {
    nodes: DiffResult<Node>;
    links: DiffResult<Link>;
  };
  stats: DiffStats;
  metadata: {
    title: string;
    leftLabel: string;
    rightLabel: string;
    description: string;
    subset: {
      reductionPercentage: number;
      activeCount: number;
      inactiveCount: number;
    };
  };
}

// ---------------------------------------------------------------------------
// KG-diff contract (Issue #56): artifact-type-agnostic diagram + summary view
// ---------------------------------------------------------------------------

export type KgDiffChangeType = 'added' | 'modified' | 'removed' | 'unchanged';

/** Shared semantic colors for KG-diff (D3, legend, badges). Use in world-map-view and KgDiffDiagramView. */
export const KG_DIFF_COLORS: Record<KgDiffChangeType, string> = {
  added: '#10b981',
  modified: '#f59e0b',
  removed: '#ef4444',
  unchanged: '#94a3b8',
};

export interface KgDiffNode {
  id: string;
  changeType: KgDiffChangeType;
  name?: string;
  description?: string;
  type?: string;
  [key: string]: unknown;
}

export interface KgDiffEdge {
  source: string | { id: string };
  target: string | { id: string };
  changeType: KgDiffChangeType;
  type?: string;
  id?: string;
  [key: string]: unknown;
}

export interface KgDiffSummary {
  nodesAdded: number;
  nodesRemoved: number;
  nodesModified: number;
  edgesAdded: number;
  edgesRemoved: number;
  edgesModified: number;
  semanticSummary?: string;
}

export interface KgDiffMetadata {
  title: string;
  description?: string;
  leftLabel: string;
  rightLabel: string;
  artifactType?: string;
}

/** Payload for KG-diff diagram and summary views (shared contract). */
export interface KgDiffPayload {
  type: 'kg_diff';
  nodes: KgDiffNode[];
  edges: KgDiffEdge[];
  summary?: KgDiffSummary;
  metadata?: KgDiffMetadata;
  /** Legacy: backend may send links instead of edges */
  links?: KgDiffEdge[];
}

/** View payload for KG-diff diagram view (diagram-consumable shape). */
export type KgDiffView = KgDiffPayload;
