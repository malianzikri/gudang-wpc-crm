import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Gudang WPC CRM"' }
  });
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Public routes: Meta webhook + public policy pages.
  if (
    path.startsWith("/api/webhooks/whatsapp") ||
    path.startsWith("/api/health") ||
    path === "/privacy" ||
    path.startsWith("/privacy/") ||
    path === "/data-deletion" ||
    path.startsWith("/data-deletion/")
  ) {
    return NextResponse.next();
  }

  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;

  if (!user || !pass) return NextResponse.next();

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return unauthorized();

  try {
    const decoded = atob(auth.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return unauthorized();

    const inputUser = decoded.slice(0, separator);
    const inputPass = decoded.slice(separator + 1);

    if (inputUser !== user || inputPass !== pass) return unauthorized();
    return NextResponse.next();
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
