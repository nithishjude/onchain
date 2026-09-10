/**
 * lib/graph/client.ts
 * Single Graph client — all subgraph queries go through here.
 * Never instantiated more than once per cold start.
 */

const SUBGRAPH_URL = `https://gateway.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/${process.env.GRAPH_SUBGRAPH_ID}`;

export async function graphQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 60 }, // Next.js cache — refresh every 60s
  });

  if (!res.ok) {
    throw new Error(`Graph request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };

  if (json.errors?.length) {
    throw new Error(`Graph error: ${json.errors.map((e) => e.message).join(", ")}`);
  }

  if (!json.data) {
    throw new Error("Graph returned no data");
  }

  return json.data;
}
