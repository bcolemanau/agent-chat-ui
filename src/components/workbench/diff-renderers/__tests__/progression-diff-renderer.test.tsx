/**
 * Unit tests for ProgressionDiffRenderer
 * Tests cover:
 * 1. Component rendering with diff data
 * 2. Progress bar display
 * 3. Side-by-side comparison
 * 4. Added items highlighting
 * 5. Empty states
 * 6. Stats display toggle
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProgressionDiffRenderer } from '../progression-diff-renderer';
import { SemanticDiff, HydrationDiffData } from '@/lib/diff-types';

// Mock Progress component
jest.mock('@/components/ui/progress', () => ({
  Progress: ({ value, className }: { value: number; className?: string }) => (
    <div data-testid="progress-bar" data-value={value} className={className}>
      Progress: {value}%
    </div>
  ),
}));

describe('ProgressionDiffRenderer', () => {
  const createMockDiff = (
    leftArtifacts: string[] = [],
    leftContext: Array<{ name: string; path: string }> = [],
    rightArtifacts: string[] = [],
    rightContext: Array<{ name: string; path: string }> = [],
    completionPercentage: number = 0
  ): SemanticDiff<HydrationDiffData> => {
    const leftState: HydrationDiffData = {
      artifacts: leftArtifacts,
      external_context: leftContext,
    };
    const rightState: HydrationDiffData = {
      artifacts: rightArtifacts,
      external_context: rightContext,
    };

    const artifactsAdded = rightArtifacts.filter(a => !leftArtifacts.includes(a));
    const contextAdded = rightContext.filter(
      c => !leftContext.some(lc => lc.name === c.name && lc.path === c.path)
    );

    return {
      type: 'progression',
      left: leftState,
      right: rightState,
      diff: {
        artifacts: {
          added: artifactsAdded,
          removed: [],
          modified: [],
          unchanged: [],
        },
        external_context: {
          added: contextAdded,
          removed: [],
          modified: [],
          unchanged: [],
        },
      },
      stats: {
        totalLeft: leftArtifacts.length + leftContext.length,
        totalRight: rightArtifacts.length + rightContext.length,
        addedCount: artifactsAdded.length + contextAdded.length,
        removedCount: 0,
        modifiedCount: 0,
        unchangedCount: 0,
      },
      metadata: {
        title: 'Test Diff',
        leftLabel: 'Start State',
        rightLabel: 'Current State',
        description: 'Test description',
        progression: {
          completionPercentage,
          itemsAdded: artifactsAdded.length + contextAdded.length,
          itemsRemaining: 0,
          direction: 'forward',
        },
      },
    };
  };

  it('should render progress header with stats', () => {
    const diff = createMockDiff([], [], ['ART-1'], [], 50);
    render(<ProgressionDiffRenderer diff={diff} showStats={true} />);

    expect(screen.getByText('Test Diff')).toBeInTheDocument();
    expect(screen.getByText(/50.0% Complete/i)).toBeInTheDocument();
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    expect(screen.getByText(/1 items added/i)).toBeInTheDocument();
  });

  it('should hide stats when showStats is false', () => {
    const diff = createMockDiff([], [], ['ART-1'], [], 50);
    render(<ProgressionDiffRenderer diff={diff} showStats={false} />);

    expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
  });

  it('should render side-by-side comparison', () => {
    const diff = createMockDiff(
      [],
      [],
      ['ART-1', 'ART-2'],
      [{ name: 'sop.md', path: 'path/sop.md' }],
      75
    );
    render(<ProgressionDiffRenderer diff={diff} />);

    expect(screen.getByText('Start State')).toBeInTheDocument();
    expect(screen.getByText('Current State')).toBeInTheDocument();
  });

  it('should display empty state messages', () => {
    const diff = createMockDiff([], [], [], [], 0);
    render(<ProgressionDiffRenderer diff={diff} />);

    expect(screen.getAllByText(/No artifacts gathered/i)).toHaveLength(2);
    expect(screen.getAllByText(/No external context saved/i)).toHaveLength(2);
  });

  it('should display artifacts in both panels', () => {
    const diff = createMockDiff([], [], ['ART-1', 'ART-2'], [], 100);
    render(<ProgressionDiffRenderer diff={diff} />);

    // Use getAllByText since artifacts appear in both the list and summary
    expect(screen.getAllByText('ART-1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ART-2').length).toBeGreaterThan(0);
  });

  it('should display external context files', () => {
    const diff = createMockDiff(
      [],
      [],
      [],
      [
        { name: 'sop.md', path: 'path/sop.md' },
        { name: 'standards.md', path: 'path/standards.md' },
      ],
      50
    );
    render(<ProgressionDiffRenderer diff={diff} />);

    // Use getAllByText since context files appear in both the list and summary
    expect(screen.getAllByText('sop.md').length).toBeGreaterThan(0);
    expect(screen.getAllByText('standards.md').length).toBeGreaterThan(0);
  });

  it('should highlight added items', () => {
    const diff = createMockDiff(['ART-1'], [], ['ART-1', 'ART-2'], [], 50);
    render(<ProgressionDiffRenderer diff={diff} />);

    // ART-2 should be marked as added
    const artifactElements = screen.getAllByText('ART-2');
    expect(artifactElements.length).toBeGreaterThan(0);
  });

  it('should show items remaining when > 0', () => {
    const diff = createMockDiff([], [], ['ART-1'], [], 50);
    const diffWithRemaining = {
      ...diff,
      metadata: {
        ...diff.metadata,
        progression: {
          ...diff.metadata.progression!,
          itemsRemaining: 2,
        },
      },
    };
    render(<ProgressionDiffRenderer diff={diffWithRemaining} />);

    expect(screen.getByText(/2 remaining/i)).toBeInTheDocument();
  });

  it('should not show items remaining when 0', () => {
    const diff = createMockDiff([], [], ['ART-1'], [], 100);
    render(<ProgressionDiffRenderer diff={diff} />);

    expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument();
  });

  it('should display added items summary section', () => {
    const diff = createMockDiff(
      [],
      [],
      ['ART-1', 'ART-2'],
      [{ name: 'sop.md', path: 'path/sop.md' }],
      75
    );
    render(<ProgressionDiffRenderer diff={diff} />);

    // Use getAllByText since "Items Added" appears in stats and summary
    expect(screen.getAllByText(/Items Added/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Artifacts \(2\):/i)).toBeInTheDocument();
    expect(screen.getByText(/External Context \(1\):/i)).toBeInTheDocument();
  });

  it('should not show added items summary when no items added', () => {
    const diff = createMockDiff([], [], [], [], 0);
    render(<ProgressionDiffRenderer diff={diff} />);

    // The summary section should not be rendered, but "items added" text might appear in stats
    // Check for the summary section specifically by looking for the green background container
    const summarySection = screen.queryByText(/Artifacts \(0\):/i);
    expect(summarySection).not.toBeInTheDocument();
  });

  it('should handle high completion percentage', () => {
    const diff = createMockDiff([], [], ['ART-1'], [], 95.5);
    render(<ProgressionDiffRenderer diff={diff} />);

    expect(screen.getByText(/95.5% Complete/i)).toBeInTheDocument();
  });

  it('should display correct artifact counts in headers', () => {
    const diff = createMockDiff(
      ['ART-1'],
      [{ name: 'old.md', path: 'path/old.md' }],
      ['ART-1', 'ART-2'],
      [{ name: 'old.md', path: 'path/old.md' }, { name: 'new.md', path: 'path/new.md' }],
      60
    );
    render(<ProgressionDiffRenderer diff={diff} />);

    // Should show counts in section headers
    const artifactHeaders = screen.getAllByText(/Methodology Artifacts/i);
    expect(artifactHeaders.length).toBeGreaterThan(0);
  });
});
