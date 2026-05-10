import { NextResponse } from "next/server";

export function authorizeCronRequest(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "CRON_SECRET is not configured. Add it to the environment before running cron routes.",
      },
      { status: 500 }
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  const validBearer = auth === `Bearer ${secret}`;
  const validHeader = headerSecret === secret;

  if (!validBearer && !validHeader) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized cron request." },
      { status: 401 }
    );
  }

  return null;
}
