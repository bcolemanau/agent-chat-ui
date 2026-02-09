/**
 * Unit tests for ProjectConfigurationDiffView
 * Tests cover:
 * 1. Component rendering with diff data
 * 2. Empty state handling
 * 3. Tab navigation
 * 4. Summary stats display
 * 5. Approve/Reject actions
 * 6. Completion badge colors
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectConfigurationDiffView } from '../project-configuration-diff-view';
import { ProjectConfigurationDiffView as ProjectConfigurationDiffViewType } from '@/lib/diff-types';

// Mock nuqs to avoid ESM import issues
jest.mock('nuqs', () => ({
  useQueryState: jest.fn(() => ['test-thread-id']),
}));

// Mock Stream provider
jest.mock('@/providers/Stream', () => ({
  useStreamContext: jest.fn(() => ({})),
}));

// Mock Tabs components
jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, value, onValueChange, className }: any) => (
    <div data-testid="tabs" data-value={value} className={className}>
      {children}
    </div>
  ),
  TabsList: ({ children }: any) => <div data-testid="tabs-list">{children}</div>,
  TabsTrigger: ({ children, value, onClick }: any) => (
    <button data-testid={`tab-${value}`} onClick={onClick}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
  ),
}));

// Mock ProgressionDiffRenderer
jest.mock('../diff-renderers/progression-diff-renderer', () => ({
  ProgressionDiffRenderer: ({ diff }: any) => (
    <div data-testid="progression-diff-renderer">
      <div>{diff.metadata.title}</div>
      <div>{diff.metadata.description}</div>
    </div>
  ),
}));

// Mock Card components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
  CardDescription: ({ children }: any) => (
    <div data-testid="card-description">{children}</div>
  ),
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
}));

describe('ProjectConfigurationDiffView', () => {
  const createMockDiffData = (
    completionPercentage: number = 50,
    artifactsCompleted: number = 2,
    artifactsTotal: number = 4,
    contextCompleted: number = 1,
    contextTotal: number = 2
  ): ProjectConfigurationDiffViewType => {
    return {
      type: 'progression',
      progress_diff: {
        type: 'progression',
        left: { artifacts: [], external_context: [] },
        right: { artifacts: ['ART-1', 'ART-2'], external_context: [{ name: 'sop.md', path: 'path/sop.md' }] },
        diff: {
          artifacts: { added: ['ART-1', 'ART-2'], removed: [], modified: [], unchanged: [] },
          external_context: { added: [{ name: 'sop.md', path: 'path/sop.md' }], removed: [], modified: [], unchanged: [] },
        },
        stats: {
          totalLeft: 0,
          totalRight: 3,
          addedCount: 3,
          removedCount: 0,
          modifiedCount: 0,
          unchangedCount: 0,
        },
        metadata: {
          title: 'Project Configuration Progress',
          leftLabel: 'Start State',
          rightLabel: 'Current State',
          description: 'What has been gathered',
          progression: {
            completionPercentage,
            itemsAdded: 3,
            itemsRemaining: 0,
            direction: 'forward',
          },
        },
      },
      remaining_diff: {
        type: 'progression',
        left: { artifacts: ['ART-1', 'ART-2'], external_context: [{ name: 'sop.md', path: 'path/sop.md' }] },
        right: { artifacts: ['ART-1', 'ART-2', 'ART-3', 'ART-4'], external_context: [{ name: 'sop.md', path: 'path/sop.md' }, { name: 'standards.md', path: 'path/standards.md' }] },
        diff: {
          artifacts: { added: ['ART-3', 'ART-4'], removed: [], modified: [], unchanged: ['ART-1', 'ART-2'] },
          external_context: { added: [{ name: 'standards.md', path: 'path/standards.md' }], removed: [], modified: [], unchanged: [{ name: 'sop.md', path: 'path/sop.md' }] },
        },
        stats: {
          totalLeft: 3,
          totalRight: 6,
          addedCount: 3,
          removedCount: 0,
          modifiedCount: 0,
          unchangedCount: 3,
        },
        metadata: {
          title: 'Remaining Work',
          leftLabel: 'Current State',
          rightLabel: '100% Enrichment',
          description: 'What still needs to be gathered',
          progression: {
            completionPercentage,
            itemsAdded: 3,
            itemsRemaining: 3,
            direction: 'forward',
          },
        },
      },
      metadata: {
        title: 'Project Configuration Progress',
        description: 'Compare states to see progress and remaining work',
        completion_percentage: completionPercentage,
        artifacts: {
          completed: artifactsCompleted,
          total: artifactsTotal,
          remaining: artifactsTotal - artifactsCompleted,
        },
        external_context: {
          completed: contextCompleted,
          total: contextTotal,
          remaining: contextTotal - contextCompleted,
        },
      },
    };
  };

  it('should render empty state when no diff data', () => {
    render(<ProjectConfigurationDiffView diffData={undefined} />);

    expect(screen.getByText(/No Project Configuration Data Available/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for project configuration proposal data/i)).toBeInTheDocument();
  });

  it('should render with diff data', () => {
    const diffData = createMockDiffData();
    render(<ProjectConfigurationDiffView diffData={diffData} />);

    expect(screen.getAllByText('Project Configuration Progress').length).toBeGreaterThan(0);
    expect(screen.getByText(/Compare states to see progress/i)).toBeInTheDocument();
  });

  it('should display completion badge', () => {
    const diffData = createMockDiffData(75);
    render(<ProjectConfigurationDiffView diffData={diffData} />);

    expect(screen.getByText(/75.0% Complete/i)).toBeInTheDocument();
  });

  it('should display summary stats cards', () => {
    const diffData = createMockDiffData(50, 2, 4, 1, 2);
    render(<ProjectConfigurationDiffView diffData={diffData} />);

    expect(screen.getByText(/Artifacts/i)).toBeInTheDocument();
    expect(screen.getByText(/External Context/i)).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 4/i)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2/i)).toBeInTheDocument();
  });

  it('should display remaining counts', () => {
    const diffData = createMockDiffData(50, 2, 4, 1, 2);
    render(<ProjectConfigurationDiffView diffData={diffData} />);

    expect(screen.getByText(/2 remaining/i)).toBeInTheDocument();
    expect(screen.getByText(/1 remaining/i)).toBeInTheDocument();
  });

  it('should render tabs for progress and remaining', () => {
    const diffData = createMockDiffData();
    render(<ProjectConfigurationDiffView diffData={diffData} />);

    expect(screen.getByTestId('tabs-list')).toBeInTheDocument();
    expect(screen.getByTestId('tab-progress')).toBeInTheDocument();
    expect(screen.getByTestId('tab-remaining')).toBeInTheDocument();
  });

  it('should switch tabs when clicked', () => {
    const diffData = createMockDiffData();
    render(<ProjectConfigurationDiffView diffData={diffData} />);

    const remainingTab = screen.getByTestId('tab-remaining');
    fireEvent.click(remainingTab);

    expect(remainingTab).toBeInTheDocument();
  });

  it('should call onApprove when approve button clicked', () => {
    const diffData = createMockDiffData();
    const onApprove = jest.fn();
    render(<ProjectConfigurationDiffView diffData={diffData} onApprove={onApprove} />);

    const approveButton = screen.getByText(/Approve Transition/i);
    fireEvent.click(approveButton);

    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('should call onReject when reject button clicked', () => {
    const diffData = createMockDiffData();
    const onReject = jest.fn();
    render(<ProjectConfigurationDiffView diffData={diffData} onReject={onReject} />);

    const rejectButton = screen.getByText(/Reject/i);
    fireEvent.click(rejectButton);

    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('should disable buttons when isLoading is true', () => {
    const diffData = createMockDiffData();
    const onApprove = jest.fn();
    render(<ProjectConfigurationDiffView diffData={diffData} onApprove={onApprove} isLoading={true} />);

    const approveButton = screen.getByText(/Approve Transition/i);
    expect(approveButton).toBeDisabled();
  });

  it('should not render action buttons when callbacks not provided', () => {
    const diffData = createMockDiffData();
    render(<ProjectConfigurationDiffView diffData={diffData} />);

    expect(screen.queryByText(/Approve Transition/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reject/i)).not.toBeInTheDocument();
  });

  it('should display progress diff renderer in progress tab', () => {
    const diffData = createMockDiffData();
    render(<ProjectConfigurationDiffView diffData={diffData} />);

    expect(screen.getAllByTestId('progression-diff-renderer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Project Configuration Progress').length).toBeGreaterThan(0);
  });

  it('should display remaining diff renderer in remaining tab', () => {
    const diffData = createMockDiffData();
    render(<ProjectConfigurationDiffView diffData={diffData} />);

    expect(screen.getAllByText('Remaining Work').length).toBeGreaterThan(0);
  });

  it('should apply correct badge color for high completion', () => {
    const diffData = createMockDiffData(85);
    render(<ProjectConfigurationDiffView diffData={diffData} />);

    expect(screen.getByText(/85.0% Complete/i)).toBeInTheDocument();
  });

  it('should handle zero completion', () => {
    const diffData = createMockDiffData(0, 0, 4, 0, 2);
    render(<ProjectConfigurationDiffView diffData={diffData} />);

    expect(screen.getByText(/0.0% Complete/i)).toBeInTheDocument();
    expect(screen.getByText(/0 \/ 4/i)).toBeInTheDocument();
  });

  it('should handle 100% completion', () => {
    const diffData = createMockDiffData(100, 4, 4, 2, 2);
    render(<ProjectConfigurationDiffView diffData={diffData} />);

    expect(screen.getByText(/100.0% Complete/i)).toBeInTheDocument();
    expect(screen.getByText(/4 \/ 4/i)).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 2/i)).toBeInTheDocument();
  });
});
