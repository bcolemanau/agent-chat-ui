import { Client } from "@langchain/langgraph-sdk";

export function createClient(apiUrl: string, apiKey: string | undefined) {
  // Normalize URL - remove trailing slash
  const cleanUrl = apiUrl.replace(/\/+$/, "");
  return new Client({
    apiKey,
    apiUrl: cleanUrl,
  });
}
