"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
        <p className="text-sm font-black uppercase tracking-[0.3em] text-yellow-400">
          YERRR Studio
        </p>
        <h1 className="mt-3 text-3xl font-black">Login</h1>
        <p className="mt-2 text-neutral-400">
          Sign in to manage the NYC slang lexicon.
        </p>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="mt-6 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 outline-none focus:border-yellow-400"
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 outline-none focus:border-yellow-400"
        />

        <button
          onClick={signIn}
          className="mt-6 w-full rounded-xl bg-yellow-400 px-4 py-3 font-black text-black hover:bg-yellow-300"
        >
          Sign In
        </button>
      </div>
    </main>
  );
}