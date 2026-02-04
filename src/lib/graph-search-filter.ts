/**
 * Pure filter for graph nodes and links by search query.
 * Used by WorldMapView to show only nodes whose id, name, type, description, or label
 * match the query (and links between them).
 */

export interface GraphNodeLike {
  id: string;
  name?: string;
  type?: string;
  description?: string;
  label?: string;
}

export interface GraphLinkLike {
  source: string | GraphNodeLike;
  target: string | GraphNodeLike;
}

function getEndpointId(link: GraphLinkLike, key: 'source' | 'target'): string {
  const endpoint = link[key];
  if (typeof endpoint === 'string') return endpoint;
  return endpoint?.id != null ? String(endpoint.id) : '';
}

function nodeMatchesQuery(node: GraphNodeLike, query: string): boolean {
  const q = query.toLowerCase();
  const id = (node.id ?? '').toLowerCase();
  const name = (node.name ?? '').toLowerCase();
  const type = (node.type ?? '').toLowerCase();
  const desc = (node.description ?? '').toLowerCase();
  const label = (node.label ?? '').toLowerCase();
  return (
    id.includes(q) ||
    name.includes(q) ||
    type.includes(q) ||
    desc.includes(q) ||
    label.includes(q)
  );
}

/**
 * Filter nodes and links by search query.
 * - Empty/whitespace query: returns nodes and links unchanged.
 * - Non-empty query: returns only nodes that match (id, name, type, description, label)
 *   and only links whose source and target are in the matching set.
 * - When no nodes match, returns empty arrays.
 */
export function filterGraphBySearch<N extends GraphNodeLike, L extends GraphLinkLike>(
  nodes: N[],
  links: L[],
  searchQuery: string
): { nodes: N[]; links: L[] } {
  const query = (searchQuery ?? "").trim().toLowerCase();
  if (!query) {
    return { nodes: [...nodes], links: [...links] };
  }

  const matchingIds = new Set(nodes.filter((n) => nodeMatchesQuery(n, query)).map((n) => n.id));
  const filteredNodes = nodes.filter((n) => matchingIds.has(n.id));
  const filteredLinks = links.filter((link) => {
    const src = getEndpointId(link, 'source');
    const tgt = getEndpointId(link, 'target');
    return matchingIds.has(src) && matchingIds.has(tgt);
  });

  return { nodes: filteredNodes, links: filteredLinks };
}
