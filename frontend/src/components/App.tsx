"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";

type Session = "loading" | "guest" | "user";

export const App = () => {
  const [session, setSession] = useState<Session>("loading");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((response) => setSession(response.ok ? "user" : "guest"))
      .catch(() => setSession("guest"));
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    let response: Response;
    try {
      response = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      setError("Could not reach the server.");
      return;
    }
    if (!response.ok) {
      setError("Invalid username or password.");
      return;
    }
    setSession("user");
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    setUsername("");
    setPassword("");
    setSession("guest");
  };

  if (session === "loading") {
    return null;
  }

  if (session === "guest") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <h1 className="font-display text-4xl font-semibold text-[var(--navy-dark)]">
          Kanban Studio
        </h1>
        <p className="mt-3 text-sm text-[var(--gray-text)]">Sign in to open your board.</p>
        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <label className="block text-sm font-semibold text-[var(--gray-text)]">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-[var(--gray-text)]">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none"
              required
            />
          </label>
          {error ? (
            <p className="text-sm text-[var(--navy-dark)]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="rounded-full bg-[var(--secondary-purple)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white"
          >
            Sign in
          </button>
        </form>
      </main>
    );
  }

  return <KanbanBoard onLogout={handleLogout} />;
};
