import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PublishingProbeResult = {
  attempted: boolean;
  status: number | null;
  anonymousRowsVisible: boolean | null;
  error: string | null;
};

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown health-check error.";
}

async function probeAnonymousPublishingAccess(): Promise<PublishingProbeResult> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
      /\/$/,
      "",
    );

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return {
      attempted: false,
      status: null,
      anonymousRowsVisible: null,
      error:
        "Supabase URL or anonymous key is not configured.",
    };
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/public_entry_settings?select=entry_id&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Accept: "application/json",
          Prefer: "count=exact",
        },
        cache: "no-store",
      },
    );

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      return {
        attempted: true,
        status: response.status,
        anonymousRowsVisible: false,
        error: null,
      };
    }

    if (!response.ok) {
      return {
        attempted: true,
        status: response.status,
        anonymousRowsVisible: null,
        error: `Publishing security probe returned HTTP ${response.status}.`,
      };
    }

    const data: unknown =
      await response.json();

    return {
      attempted: true,
      status: response.status,
      anonymousRowsVisible:
        Array.isArray(data) &&
        data.length > 0,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      status: null,
      anonymousRowsVisible: null,
      error: getErrorMessage(error),
    };
  }
}

export async function GET() {
  const publishingProbe =
    await probeAnonymousPublishingAccess();

  const checks = {
    supabaseUrlConfigured: configured(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),

    supabaseAnonKeyConfigured: configured(
      process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),

    openAIKeyConfigured: configured(
      process.env.OPENAI_API_KEY,
    ),

    appUrlConfigured: Boolean(
      process.env.NEXT_PUBLIC_APP_URL ||
        process.env.VERCEL_URL,
    ),

    publishingAnonVisible:
      publishingProbe.anonymousRowsVisible,
  };

  const coreEnvironmentReady =
    checks.supabaseUrlConfigured &&
    checks.supabaseAnonKeyConfigured &&
    checks.openAIKeyConfigured;

  return NextResponse.json(
    {
      ok: coreEnvironmentReady,
      environment:
        process.env.NODE_ENV ??
        "unknown",
      generatedAt:
        new Date().toISOString(),
      checks,
      publishingProbe,
    },
    {
      status: 200,
      headers: {
        "Cache-Control":
          "no-store, max-age=0",
      },
    },
  );
}