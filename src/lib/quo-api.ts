import type {
  QuoApiCall,
  QuoApiTranscript,
  QuoApiSummary,
  QuoApiRecording,
  QuoApiPhoneNumber,
  QuoApiConversation,
} from "./types";

const QUO_API_BASE = "https://api.openphone.com";

function getApiKey(): string {
  const key = process.env.QUO_API_KEY;
  if (!key) throw new Error("QUO_API_KEY is not set");
  return key;
}

async function quoFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${QUO_API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: getApiKey() },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Quo API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function listPhoneNumbers(): Promise<QuoApiPhoneNumber[]> {
  const res = await quoFetch<{ data: QuoApiPhoneNumber[] }>("/v1/phone-numbers");
  return res.data;
}

export async function listConversations(
  phoneNumberId: string,
  pageToken?: string
): Promise<{ data: QuoApiConversation[]; nextPageToken?: string }> {
  const params: Record<string, string> = {
    phoneNumberIds: phoneNumberId,
    maxResults: "50",
  };
  if (pageToken) params.pageToken = pageToken;
  return quoFetch<{ data: QuoApiConversation[]; nextPageToken?: string }>(
    "/v1/conversations",
    params
  );
}

export async function listCalls(
  phoneNumberId: string,
  participant: string,
  opts?: { createdAfter?: string; createdBefore?: string; pageToken?: string }
): Promise<{ data: QuoApiCall[]; nextPageToken?: string }> {
  const params: Record<string, string> = {
    phoneNumberId,
    "participants[]": participant,
    maxResults: "100",
  };
  if (opts?.createdAfter) params.createdAfter = opts.createdAfter;
  if (opts?.createdBefore) params.createdBefore = opts.createdBefore;
  if (opts?.pageToken) params.pageToken = opts.pageToken;

  return quoFetch<{ data: QuoApiCall[]; nextPageToken?: string }>("/v1/calls", params);
}

export async function getCallById(callId: string): Promise<QuoApiCall> {
  const res = await quoFetch<{ data: QuoApiCall }>(`/v1/calls/${callId}`);
  return res.data;
}

export async function getCallTranscript(callId: string): Promise<QuoApiTranscript> {
  const res = await quoFetch<{ data: QuoApiTranscript }>(`/v1/call-transcripts/${callId}`);
  return res.data;
}

export async function getCallSummary(callId: string): Promise<QuoApiSummary> {
  const res = await quoFetch<{ data: QuoApiSummary }>(`/v1/call-summaries/${callId}`);
  return res.data;
}

export async function getCallRecordings(callId: string): Promise<QuoApiRecording[]> {
  const res = await quoFetch<{ data: QuoApiRecording[] }>(`/v1/call-recordings/${callId}`);
  return res.data;
}

export async function getAllConversations(
  phoneNumberId: string
): Promise<QuoApiConversation[]> {
  const all: QuoApiConversation[] = [];
  let pageToken: string | undefined;

  do {
    const result = await listConversations(phoneNumberId, pageToken);
    all.push(...result.data);
    pageToken = result.nextPageToken;
  } while (pageToken);

  return all;
}

export async function getAllCallsForParticipant(
  phoneNumberId: string,
  participant: string,
  opts?: { createdAfter?: string; createdBefore?: string }
): Promise<QuoApiCall[]> {
  const all: QuoApiCall[] = [];
  let pageToken: string | undefined;

  do {
    const result = await listCalls(phoneNumberId, participant, {
      ...opts,
      pageToken,
    });
    all.push(...result.data);
    pageToken = result.nextPageToken;
  } while (pageToken);

  return all;
}
