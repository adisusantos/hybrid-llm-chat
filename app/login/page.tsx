import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { AUTH_COOKIE_NAME, isPasswordProtectionEnabled, isValidAuthToken } from "@/lib/auth";
import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isPasswordProtectionEnabled()) {
    redirect("/");
  }

  const cookieStore = await cookies();
  const isAuthed = await isValidAuthToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (isAuthed) {
    redirect("/");
  }

  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md border border-border bg-background">
            <LockKeyhole className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Llamarole</h1>
            <p className="text-sm text-muted-foreground">Private access</p>
          </div>
        </div>

        <form action={loginAction} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              className="h-10"
            />
          </div>

          {params.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Password salah.
            </p>
          ) : null}

          <SubmitButton
            loadingText="Checking..."
            className={buttonVariants({ className: "h-10 w-full" })}
          >
            Masuk
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
