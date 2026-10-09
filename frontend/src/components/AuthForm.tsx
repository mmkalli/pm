"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, type User } from "@/lib/api";
import { errorClass, inputClass, labelClass, primaryButton } from "@/components/ui";

type AuthFormProps = {
  onSignedIn: (user: User) => void;
};

export const AuthForm = ({ onSignedIn }: AuthFormProps) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const registering = mode === "register";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      onSignedIn(
        await api<User>(registering ? "/api/register" : "/api/login", "POST", {
          username,
          password,
        })
      );
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : 0;
      if (status === 0) {
        setError("Could not reach the server.");
      } else if (status === 409) {
        setError("That username is taken.");
      } else if (status === 422) {
        setError(
          "Use 3-32 letters, digits, dots, dashes, or underscores, and a password of at least 8 characters."
        );
      } else {
        setError("Invalid username or password.");
      }
    }
  };

  const switchMode = () => {
    setMode(registering ? "login" : "register");
    setError("");
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-display text-4xl font-semibold text-[var(--navy-dark)]">
        Kanban Studio
      </h1>
      <p className="mt-3 text-sm text-[var(--gray-text)]">
        {registering ? "Create an account to start planning." : "Sign in to open your boards."}
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className={labelClass}>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className={`mt-2 ${inputClass}`}
            required
          />
        </label>
        <label className={labelClass}>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={registering ? "new-password" : "current-password"}
            className={`mt-2 ${inputClass}`}
            required
          />
        </label>
        {error ? (
          <p className={errorClass} role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <button type="submit" className={primaryButton}>
            {registering ? "Create account" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={switchMode}
            className="text-sm font-semibold text-[var(--primary-blue)]"
          >
            {registering ? "Have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </form>
    </main>
  );
};
