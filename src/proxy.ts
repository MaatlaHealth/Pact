import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic routing on the session cookie. Real authorization happens in
 * the server components and route handlers; this only avoids rendering the
 * app shell for visitors who clearly have no session.
 */
export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get("pact_session")?.value);
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/app") && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if ((pathname === "/sign-in" || pathname === "/sign-up") && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/sign-in", "/sign-up"],
};
