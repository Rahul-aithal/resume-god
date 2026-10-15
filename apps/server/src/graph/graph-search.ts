/**
 * Semantic layer over the knowledge-graph tables: TF-IDF vectors,
 * cosine similarity, co-occurrence expansion, transitive implications.
 * Port of resume_god/graph.py (ProfileGraph math), source = DB rows.
 */

export interface SearchDoc {
  id: string;
  document: string;
}

export interface SearchResult {
  id: string;
  similarity: number;
}

const WORD = /[a-z0-9][a-z0-9+#._-]*/gi;

export function tokenize(value: string): string[] {
  return (value.match(WORD) ?? []).map((token) =>
    token.toLowerCase().replace(/^[._-]+|[._-]+$/g, ""),
  );
}

export function cosine(
  left: Record<string, number>,
  right: Record<string, number>,
): number {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length === 0 || rightKeys.length === 0) return 0;
  let dot = 0;
  for (const [token, value] of Object.entries(left)) {
    dot += value * (right[token] ?? 0);
  }
  const leftNorm = Math.sqrt(
    leftKeys.reduce((sum, token) => sum + left[token] * left[token], 0),
  );
  const rightNorm = Math.sqrt(
    rightKeys.reduce((sum, token) => sum + right[token] * right[token], 0),
  );
  return leftNorm && rightNorm ? dot / (leftNorm * rightNorm) : 0;
}

export function tfidfVectors(
  documents: string[],
): Array<Record<string, number>> {
  const tokenized = documents.map(tokenize);
  const documentFrequency = new Map<string, number>();
  for (const tokens of tokenized) {
    for (const token of new Set(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const total = Math.max(tokenized.length, 1);
  return tokenized.map((tokens) => {
    const frequency = new Map<string, number>();
    for (const token of tokens) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
    const values: Record<string, number> = {};
    for (const [token, count] of frequency) {
      const df = documentFrequency.get(token) ?? 0;
      values[token] =
        (count / (tokens.length || 1)) * (Math.log((total + 1) / (df + 1)) + 1);
    }
    return values;
  });
}

export function queryVector(
  query: string,
  vectors: Array<Record<string, number>>,
): Record<string, number> {
  const vocabulary = new Set<string>();
  for (const vector of vectors) {
    for (const token of Object.keys(vector)) vocabulary.add(token);
  }
  const tokens = tokenize(query).filter((token) => vocabulary.has(token));
  if (tokens.length === 0) return {};
  const total = Math.max(vectors.length, 1);
  const documentFrequency = new Map<string, number>();
  for (const vector of vectors) {
    for (const token of Object.keys(vector)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const frequency = new Map<string, number>();
  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }
  const values: Record<string, number> = {};
  for (const [token, count] of frequency) {
    const df = documentFrequency.get(token) ?? 0;
    values[token] =
      (count / tokens.length) * (Math.log((total + 1) / (df + 1)) + 1);
  }
  return values;
}

export function searchDocs(
  query: string,
  docs: SearchDoc[],
  limit: number,
): SearchResult[] {
  const vectors = tfidfVectors(docs.map((doc) => doc.document));
  const queryVec = queryVector(query, vectors);
  const rows: SearchResult[] = [];
  for (let index = 0; index < docs.length; index += 1) {
    const score = cosine(queryVec, vectors[index]);
    if (score > 0) rows.push({ id: docs[index].id, similarity: score });
  }
  rows.sort((a, b) => b.similarity - a.similarity);
  return rows.slice(0, limit).map((row) => ({
    ...row,
    similarity: Number(row.similarity.toFixed(8)),
  }));
}

/** BFS expansion over an adjacency map (python expand_skills parity). */
export function expand(
  startId: string,
  adjacency: Map<string, Set<string>>,
  hops: 1 | 2,
): string[] {
  let frontier = new Set([startId]);
  const seen = new Set([startId]);
  for (let hop = 0; hop < hops; hop += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const adjacent of adjacency.get(id) ?? []) next.add(adjacent);
    }
    frontier = new Set([...next].filter((id) => !seen.has(id)));
    for (const id of frontier) seen.add(id);
  }
  return [...seen].filter((id) => id !== startId).sort();
}

/** Transitive implication closure over from→to edges. */
export function impliedClosure(
  startId: string,
  edges: Array<{ from: string; to: string }>,
): string[] {
  const map = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!map.has(edge.from)) map.set(edge.from, new Set());
    map.get(edge.from)!.add(edge.to);
  }
  const seen = new Set<string>([startId]);
  const frontier = [startId];
  while (frontier.length > 0) {
    const current = frontier.pop()!;
    for (const next of map.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        frontier.push(next);
      }
    }
  }
  return [...seen].filter((id) => id !== startId).sort();
}
