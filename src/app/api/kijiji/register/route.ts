import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const KIJIJI_GRAPHQL = "https://www.kijiji.ca/anvil/api";

const REGISTER_MUTATION = `mutation registerUser($input: UserRegistrationInput!) {
  userRegistration(input: $input)
}`;

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  reCaptchaToken: string;
}

/**
 * POST /api/kijiji/register
 *
 * Proxies a Kijiji account registration request.
 * The caller must provide a valid reCAPTCHA token obtained from
 * a real browser (not a headless/bot browser).
 *
 * Body: { email, password, displayName, reCaptchaToken }
 *   or  { bulk: [{ email, password, displayName, reCaptchaToken }] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.bulk && Array.isArray(body.bulk)) {
    const results = [];
    for (const entry of body.bulk as RegisterInput[]) {
      const result = await registerOne(entry);
      results.push({ email: entry.email, ...result });
    }
    return NextResponse.json({ results });
  }

  const { email, password, displayName, reCaptchaToken } = body;

  if (!email || !password || !displayName || !reCaptchaToken) {
    return NextResponse.json(
      { error: "email, password, displayName, and reCaptchaToken required" },
      { status: 400 }
    );
  }

  const result = await registerOne({
    email,
    password,
    displayName,
    reCaptchaToken,
  });

  return NextResponse.json(result, {
    status: result.success ? 201 : 400,
  });
}

async function registerOne(
  input: RegisterInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch(KIJIJI_GRAPHQL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apollo-require-preflight": "true",
        "x-recaptcha-token": input.reCaptchaToken,
      },
      body: JSON.stringify({
        operationName: "registerUser",
        variables: {
          input: {
            email: input.email,
            password: input.password,
            displayName: input.displayName,
            businessName: "",
            redirectUrl: "",
            reCaptchaToken: input.reCaptchaToken,
          },
        },
        query: REGISTER_MUTATION,
      }),
    });

    const data = await resp.json();

    if (data.errors && data.errors.length > 0) {
      return {
        success: false,
        error: data.errors.map((e: { message: string }) => e.message).join("; "),
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
