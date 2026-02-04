/**
 * Unit tests for graph-search-filter (map view search).
 * Tests cover:
 * - Empty query returns all nodes and links
 * - Query matches by id, name, type, description, label (case-insensitive)
 * - Links are filtered to those whose source and target are in the matching set
 * - No matches returns empty nodes and links
 * - Whitespace-only query is treated as empty
 */

import { filterGraphBySearch } from '../graph-search-filter';

type TestNode = { id: string; name?: string; type?: string; description?: string; label?: string };
type TestLink = { source: string | TestNode; target: string | TestNode };

describe('filterGraphBySearch', () => {
  const nodes: TestNode[] = [
    { id: 'ART-requirements', name: 'Requirements Doc', type: 'ARTIFACT', description: 'Product requirements' },
    { id: 'COMP-api', name: 'API Service', type: 'COMPONENT', description: 'REST API' },
    { id: 'CRIT-security', name: 'Security Risk', type: 'CRIT', description: 'Data exposure risk' },
    { id: 'REQ-001', name: 'User login', type: 'REQ', label: 'REQ-001' },
  ];

  const links: TestLink[] = [
    { source: 'ART-requirements', target: 'COMP-api' },
    { source: 'COMP-api', target: 'CRIT-security' },
    { source: 'ART-requirements', target: 'REQ-001' },
  ];

  it('returns all nodes and links when query is empty', () => {
    const result = filterGraphBySearch(nodes, links, '');
    expect(result.nodes).toHaveLength(4);
    expect(result.links).toHaveLength(3);
  });

  it('returns all nodes and links when query is whitespace only', () => {
    const result = filterGraphBySearch(nodes, links, '   \n\t  ');
    expect(result.nodes).toHaveLength(4);
    expect(result.links).toHaveLength(3);
  });

  it('filters by id (case-insensitive)', () => {
    const result = filterGraphBySearch(nodes, links, 'REQ-001');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('REQ-001');
    expect(result.links).toHaveLength(0); // no link has both endpoints in { REQ-001 }
  });

  it('filters by name (case-insensitive)', () => {
    const result = filterGraphBySearch(nodes, links, 'api service');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('COMP-api');
    expect(result.links).toHaveLength(0); // no link has both endpoints in { COMP-api }
  });

  it('filters by type (case-insensitive)', () => {
    const result = filterGraphBySearch(nodes, links, 'CRIT');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('CRIT-security');
    expect(result.links).toHaveLength(0); // no link has both endpoints in { CRIT-security }
  });

  it('filters by description (substring)', () => {
    const result = filterGraphBySearch(nodes, links, 'exposure');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('CRIT-security');
  });

  it('filters by label', () => {
    const result = filterGraphBySearch(nodes, links, 'REQ-001');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].label).toBe('REQ-001');
  });

  it('returns only links whose source and target are in the matching set', () => {
    const result = filterGraphBySearch(nodes, links, 'requirements');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('ART-requirements');
    expect(result.links).toHaveLength(0); // no link has both endpoints in { ART-requirements }
  });

  it('returns empty nodes and links when no node matches', () => {
    const result = filterGraphBySearch(nodes, links, 'nonexistent');
    expect(result.nodes).toHaveLength(0);
    expect(result.links).toHaveLength(0);
  });

  it('matches multiple nodes and keeps links between them', () => {
    const result = filterGraphBySearch(nodes, links, 'req');
    expect(result.nodes.map((n) => n.id).sort()).toEqual(['ART-requirements', 'REQ-001']);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].source).toBe('ART-requirements');
    expect(result.links[0].target).toBe('REQ-001');
  });

  it('does not mutate input arrays', () => {
    const nodesCopy = [...nodes];
    const linksCopy = [...links];
    filterGraphBySearch(nodes, links, 'CRIT');
    expect(nodes).toEqual(nodesCopy);
    expect(links).toEqual(linksCopy);
  });
});
