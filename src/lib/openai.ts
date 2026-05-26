import OpenAI from "openai";

let _client: OpenAI | null = null;

/**
 * Returns an OpenAI-compatible client pointed at NVIDIA NIM.
 */
export function getOpenAI(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY,
      baseURL: "https://integrate.api.nvidia.com/v1",
    });
  }
  return _client;
}
