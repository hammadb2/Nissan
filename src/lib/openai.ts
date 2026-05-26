import OpenAI from "openai";

let _client: OpenAI | null = null;

/**
 * Returns an OpenAI-compatible client pointed at Groq's API.
 * Groq uses the same chat completions interface as OpenAI.
 */
export function getOpenAI(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return _client;
}
