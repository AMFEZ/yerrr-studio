import { Suspense } from "react";

import { LoginForm } from "@/components/auth/LoginForm";

function LoginLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
      <div className="text-center">
        <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />

        <p className="mt-4 font-black">
          Loading login…
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<LoginLoading />}
    >
      <LoginForm />
    </Suspense>
  );
}