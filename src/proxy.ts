import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only: redirects page requests without a session cookie to /login.
 * Real authentication and authorization happen server-side in every page, action and API route.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.get("rh_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Public: login, Stripe return page, APIs (own auth), build assets, brand images and app icons.
  matcher: ["/((?!login|paid|api|_next/static|_next/image|brand/|favicon.ico|icon|apple-icon).*)"],
};
