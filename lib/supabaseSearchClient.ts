"use client";

import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

let searchClient: SupabaseClient | null = null;

type SessionTokens = {
  access_token: string;
  refresh_token: string;
};

function getSupabaseConfiguration() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or Supabase public browser key.",
    );
  }

  return {
    supabaseUrl,
    supabaseKey,
  };
}

export function getSupabaseSearchClient() {
  if (searchClient) {
    return searchClient;
  }

  const {
    supabaseUrl,
    supabaseKey,
  } = getSupabaseConfiguration();

  searchClient = createClient(
    supabaseUrl,
    supabaseKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );

  return searchClient;
}

function isSessionTokens(
  value: unknown,
): value is SessionTokens {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<
    string,
    unknown
  >;

  return (
    typeof record.access_token === "string" &&
    record.access_token.length > 0 &&
    typeof record.refresh_token === "string" &&
    record.refresh_token.length > 0
  );
}

function findSessionTokens(
  value: unknown,
  visited = new Set<object>(),
): SessionTokens | null {
  if (isSessionTokens(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  if (visited.has(value)) {
    return null;
  }

  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const tokens = findSessionTokens(
        item,
        visited,
      );

      if (tokens) {
        return tokens;
      }
    }

    return null;
  }

  for (const childValue of Object.values(
    value as Record<string, unknown>,
  )) {
    const tokens = findSessionTokens(
      childValue,
      visited,
    );

    if (tokens) {
      return tokens;
    }
  }

  return null;
}

function decodeStoredValue(
  rawValue: string,
) {
  if (!rawValue.startsWith("base64-")) {
    return rawValue;
  }

  try {
    return atob(
      rawValue.slice("base64-".length),
    );
  } catch {
    return rawValue;
  }
}

function parseStoredSession(
  rawValue: string,
) {
  try {
    const decodedValue =
      decodeStoredValue(rawValue);

    return findSessionTokens(
      JSON.parse(decodedValue),
    );
  } catch {
    return null;
  }
}

function getStorageCandidates() {
  if (typeof window === "undefined") {
    return [];
  }

  const storages: Storage[] = [
    window.localStorage,
    window.sessionStorage,
  ];

  const candidates: SessionTokens[] = [];

  for (const storage of storages) {
    for (
      let index = 0;
      index < storage.length;
      index += 1
    ) {
      const key = storage.key(index);

      if (!key) continue;

      const normalizedKey =
        key.toLowerCase();

      const looksLikeSupabaseAuth =
        normalizedKey.includes("supabase") ||
        normalizedKey.includes("auth-token") ||
        normalizedKey.startsWith("sb-");

      if (!looksLikeSupabaseAuth) {
        continue;
      }

      const rawValue =
        storage.getItem(key);

      if (!rawValue) continue;

      const tokens =
        parseStoredSession(rawValue);

      if (tokens) {
        candidates.push(tokens);
      }
    }
  }

  return candidates;
}

async function restoreStoredSession(
  client: SupabaseClient,
) {
  const candidates =
    getStorageCandidates();

  for (const tokens of candidates) {
    const {
      data,
      error,
    } = await client.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    if (
      !error &&
      data.session?.access_token
    ) {
      return data.session;
    }
  }

  return null;
}

export async function getSupabaseSession(): Promise<Session | null> {
  const client =
    getSupabaseSearchClient();

  const {
    data: {
      session: existingSession,
    },
  } = await client.auth.getSession();

  if (existingSession?.access_token) {
    return existingSession;
  }

  const restoredSession =
    await restoreStoredSession(client);

  if (restoredSession?.access_token) {
    return restoredSession;
  }

  const {
    data: {
      session: refreshedSession,
    },
  } = await client.auth.refreshSession();

  return refreshedSession ?? null;
}

export async function getSupabaseAccessToken() {
  const session =
    await getSupabaseSession();

  if (!session?.access_token) {
    throw new Error(
      "YERRR Studio could not find the active Supabase login. Refresh the page or sign out and back in.",
    );
  }

  return session.access_token;
}