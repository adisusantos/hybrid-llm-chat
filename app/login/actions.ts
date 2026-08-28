"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_COOKIE_NAME,
  createAuthToken,
  getAppPassword,
  shouldUseSecureCookies,
} from "@/lib/auth";

async function isSecureCookie() {
  if (shouldUseSecureCookies()) {
    return true;
  }
  const forwardedProto = (await headers()).get("x-forwarded-proto");

  return forwardedProto === "https";
}

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const appPassword = getAppPassword();

  if (!appPassword || password !== appPassword) {
    redirect("/login?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, await createAuthToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: await isSecureCookie(),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/");
}
