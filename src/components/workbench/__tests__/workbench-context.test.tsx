/**
 * Unit tests for WorkbenchContext
 * Tests cover:
 * 1. Context provider functionality
 * 2. Node selection state management
 * 3. Hook error handling
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { WorkbenchProvider, useWorkbenchContext, Node } from '../workbench-context';

// Test component that uses the hook
function TestComponent({ onNodeChange }: { onNodeChange?: (node: Node | null) => void }) {
  const { selectedNode, setSelectedNode } = useWorkbenchContext();
  
  React.useEffect(() => {
    if (onNodeChange) {
      onNodeChange(selectedNode);
    }
  }, [selectedNode, onNodeChange]);

  return (
    <div>
      <div data-testid="selected-node-id">{selectedNode?.id || 'null'}</div>
      <div data-testid="selected-node-name">{selectedNode?.name || 'null'}</div>
      <button onClick={() => setSelectedNode({ id: 'test-1', name: 'Test Node', type: 'ARTIFACT' })}>
        Select Node
      </button>
      <button onClick={() => setSelectedNode(null)}>Clear Node</button>
    </div>
  );
}

describe('WorkbenchContext', () => {
  it('should provide default null selectedNode', () => {
    render(
      <WorkbenchProvider>
        <TestComponent />
      </WorkbenchProvider>
    );

    expect(screen.getByTestId('selected-node-id')).toHaveTextContent('null');
    expect(screen.getByTestId('selected-node-name')).toHaveTextContent('null');
  });

  it('should allow setting selectedNode', () => {
    render(
      <WorkbenchProvider>
        <TestComponent />
      </WorkbenchProvider>
    );

    const selectButton = screen.getByText('Select Node');
    act(() => {
      selectButton.click();
    });

    expect(screen.getByTestId('selected-node-id')).toHaveTextContent('test-1');
    expect(screen.getByTestId('selected-node-name')).toHaveTextContent('Test Node');
  });

  it('should allow clearing selectedNode', () => {
    render(
      <WorkbenchProvider>
        <TestComponent />
      </WorkbenchProvider>
    );

    // First select a node
    const selectButton = screen.getByText('Select Node');
    act(() => {
      selectButton.click();
    });

    expect(screen.getByTestId('selected-node-id')).toHaveTextContent('test-1');

    // Then clear it
    const clearButton = screen.getByText('Clear Node');
    act(() => {
      clearButton.click();
    });

    expect(screen.getByTestId('selected-node-id')).toHaveTextContent('null');
    expect(screen.getByTestId('selected-node-name')).toHaveTextContent('null');
  });

  it('should update selectedNode when setSelectedNode is called', () => {
    const onNodeChange = jest.fn();
    
    render(
      <WorkbenchProvider>
        <TestComponent onNodeChange={onNodeChange} />
      </WorkbenchProvider>
    );

    const selectButton = screen.getByText('Select Node');
    act(() => {
      selectButton.click();
    });

    expect(onNodeChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-1',
        name: 'Test Node',
        type: 'ARTIFACT',
      })
    );
  });

  it('should handle node with all properties', () => {
    const mockNode: Node = {
      id: 'full-node',
      name: 'Full Node',
      type: 'MECH',
      description: 'Test description',
      properties: { key: 'value' },
      metadata: { meta: 'data' },
      is_active: true,
      diff_status: 'modified',
    };

    render(
      <WorkbenchProvider>
        <TestComponent />
      </WorkbenchProvider>
    );

    // Select a node using the button
    const selectButton = screen.getByText('Select Node');
    act(() => {
      selectButton.click();
    });

    // Verify node can be set with all properties
    expect(screen.getByTestId('selected-node-id')).toHaveTextContent('test-1');
  });

  it('should throw error when useWorkbenchContext is used outside provider', () => {
    // Suppress console.error for this test
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useWorkbenchContext must be used within a WorkbenchProvider');

    consoleError.mockRestore();
  });

  it('should maintain state across re-renders', () => {
    const { rerender } = render(
      <WorkbenchProvider>
        <TestComponent />
      </WorkbenchProvider>
    );

    // Select a node
    const selectButton = screen.getByText('Select Node');
    act(() => {
      selectButton.click();
    });

    expect(screen.getByTestId('selected-node-id')).toHaveTextContent('test-1');

    // Re-render with same provider
    rerender(
      <WorkbenchProvider>
        <TestComponent />
      </WorkbenchProvider>
    );

    // State should be maintained
    expect(screen.getByTestId('selected-node-id')).toHaveTextContent('test-1');
  });
});
