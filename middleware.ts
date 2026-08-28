import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, isPasswordProtectionEnabled, isValidAuthToken } from "@/lib/auth";

const PUBLIC_FILE = /\.[^/]+$/;

export async function middleware(request: NextRequest) {
  if (!isPasswordProtectionEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const isAuthed = await isValidAuthToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);

  if (isAuthed) {
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    PUBLIC_FILE.test(pathname)
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};