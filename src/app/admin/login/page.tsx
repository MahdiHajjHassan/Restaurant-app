import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  // The admin console must never appear in search results.
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Sign in</h1>
        <p className="mt-1.5 text-[0.875rem] text-[var(--c-text-muted)]">
          Manage your restaurant&rsquo;s menu.
        </p>
      </div>

      <LoginForm />
    </main>
  );
}
