import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

function getSafeNextPath(
  value: string | null,
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/update-password";
  }

  return value;
}

export async function GET(
  request: NextRequest,
) {
  const code =
    request.nextUrl.searchParams.get(
      "code",
    );

  const nextPath = getSafeNextPath(
    request.nextUrl.searchParams.get(
      "next",
    ),
  );

  const destination =
    request.nextUrl.clone();

  destination.pathname = nextPath;
  destination.search = "";

  let response =
    NextResponse.redirect(destination);

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    !code ||
    !supabaseUrl ||
    !supabaseKey
  ) {
    const errorUrl =
      request.nextUrl.clone();

    errorUrl.pathname =
      "/update-password";

    errorUrl.search = "";
    errorUrl.searchParams.set(
      "error",
      "invalid_link",
    );

    return NextResponse.redirect(
      errorUrl,
    );
  }

  const supabase =
    createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },

          setAll(
            cookiesToSet: Array<{
              name: string;
              value: string;
              options: CookieOptions;
            }>,
          ) {
            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                response.cookies.set(
                  name,
                  value,
                  options,
                );
              },
            );
          },
        },
      },
    );

  const { error } =
    await supabase.auth
      .exchangeCodeForSession(code);

  if (error) {
    const errorUrl =
      request.nextUrl.clone();

    errorUrl.pathname =
      "/update-password";

    errorUrl.search = "";
    errorUrl.searchParams.set(
      "error",
      "invalid_link",
    );

    return NextResponse.redirect(
      errorUrl,
    );
  }

  return response;
}