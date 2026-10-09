"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import {
  errorClass,
  ghostButton,
  headingClass,
  inputClass,
  labelClass,
  panelClass,
  primaryButton,
} from "@/components/ui";

type AccountSettingsProps = {
  onDeleted: () => void;
};

const failure = (caught: unknown, wrongPassword: string) => {
  const status = caught instanceof ApiError ? caught.status : 0;
  if (status === 403) {
    return wrongPassword;
  }
  if (status === 422) {
    return "The new password must be at least 8 characters.";
  }
  return "Could not reach the server.";
};

export const AccountSettings = ({ onDeleted }: AccountSettingsProps) => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const handlePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");
    if (next !== confirm) {
      setPasswordError("The new passwords do not match.");
      return;
    }
    try {
      await api("/api/me/password", "PUT", { currentPassword: current, newPassword: next });
    } catch (caught) {
      setPasswordError(failure(caught, "The current password is wrong."));
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setPasswordMessage("Password changed.");
  };

  const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDeleteError("");
    if (!window.confirm("Delete your account and all of your boards? This cannot be undone.")) {
      return;
    }
    try {
      await api("/api/me", "DELETE", { password: deletePassword });
    } catch (caught) {
      setDeleteError(failure(caught, "The password is wrong."));
      return;
    }
    onDeleted();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={panelClass}>
        <h2 className={headingClass}>Change password</h2>
        <form onSubmit={handlePassword} className="mt-4 space-y-4">
          <label className={labelClass}>
            Current password
            <input
              type="password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              autoComplete="current-password"
              className={`mt-2 ${inputClass}`}
              required
            />
          </label>
          <label className={labelClass}>
            New password
            <input
              type="password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              className={`mt-2 ${inputClass}`}
              required
            />
          </label>
          <label className={labelClass}>
            Confirm new password
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              className={`mt-2 ${inputClass}`}
              required
            />
          </label>
          {passwordError ? (
            <p className={errorClass} role="alert">
              {passwordError}
            </p>
          ) : null}
          {passwordMessage ? (
            <p className="text-sm text-[var(--primary-blue)]" role="status">
              {passwordMessage}
            </p>
          ) : null}
          <button type="submit" className={primaryButton}>
            Change password
          </button>
        </form>
      </section>
      <section className={panelClass}>
        <h2 className={headingClass}>Delete account</h2>
        <p className="mt-2 text-sm text-[var(--gray-text)]">
          Removes your account and every board you own.
        </p>
        <form onSubmit={handleDelete} className="mt-4 space-y-4">
          <label className={labelClass}>
            Password
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              autoComplete="current-password"
              className={`mt-2 ${inputClass}`}
              required
            />
          </label>
          {deleteError ? (
            <p className={errorClass} role="alert">
              {deleteError}
            </p>
          ) : null}
          <button type="submit" className={ghostButton}>
            Delete my account
          </button>
        </form>
      </section>
    </div>
  );
};
