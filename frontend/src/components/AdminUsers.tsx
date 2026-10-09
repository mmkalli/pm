"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, errorText, type AdminUserRow, type User } from "@/lib/api";
import {
  errorClass,
  ghostButton,
  headingClass,
  inputClass,
  labelClass,
  panelClass,
  primaryButton,
} from "@/components/ui";

type AdminUsersProps = {
  currentUserId: number;
};

export const AdminUsers = ({ currentUserId }: AdminUsersProps) => {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const load = () =>
    api<AdminUserRow[]>("/api/users")
      .then(setUsers)
      .catch(() => setError("Could not load users."));

  useEffect(() => {
    void load();
  }, []);

  const run = async (action: () => Promise<unknown>, done: string, fallback: string) => {
    setError("");
    setMessage("");
    try {
      await action();
    } catch (caught) {
      setError(errorText(caught, fallback));
      return false;
    }
    setMessage(done);
    await load();
    return true;
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await run(
      () => api<User>("/api/users", "POST", { username, password, isAdmin }),
      `Created ${username}.`,
      "Could not create the user."
    );
    if (created) {
      setUsername("");
      setPassword("");
      setIsAdmin(false);
    }
  };

  const handleReset = async (event: FormEvent<HTMLFormElement>, user: AdminUserRow) => {
    event.preventDefault();
    const reset = await run(
      () => api(`/api/users/${user.id}`, "PATCH", { password: resetPassword }),
      `Password reset for ${user.username}.`,
      "Could not reset the password."
    );
    if (reset) {
      setResetId(null);
      setResetPassword("");
    }
  };

  const handleDelete = (user: AdminUserRow) => {
    if (!window.confirm(`Delete ${user.username} and all of their boards?`)) {
      return;
    }
    void run(
      () => api(`/api/users/${user.id}`, "DELETE"),
      `Deleted ${user.username}.`,
      "Could not delete the user."
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <section className={panelClass}>
        <h2 className={headingClass}>Users</h2>
        {error ? (
          <p className={`mt-3 ${errorClass}`} role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm text-[var(--primary-blue)]" role="status">
            {message}
          </p>
        ) : null}
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--gray-text)]">
            <tr>
              <th className="py-2">Username</th>
              <th className="py-2">Role</th>
              <th className="py-2">Boards</th>
              <th className="py-2">Created</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const self = user.id === currentUserId;
              return (
                <tr
                  key={user.id}
                  className="border-t border-[var(--stroke)] align-top"
                  data-testid={`user-row-${user.username}`}
                >
                  <td className="py-3 font-semibold text-[var(--navy-dark)]">
                    {user.username}
                    {self ? <span className="ml-2 text-xs text-[var(--gray-text)]">(you)</span> : null}
                  </td>
                  <td className="py-3 text-[var(--gray-text)]">{user.isAdmin ? "Admin" : "Member"}</td>
                  <td className="py-3 text-[var(--gray-text)]">{user.boardCount}</td>
                  <td className="py-3 text-[var(--gray-text)]">{user.createdAt.slice(0, 10)}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={self}
                        onClick={() =>
                          void run(
                            () => api(`/api/users/${user.id}`, "PATCH", { isAdmin: !user.isAdmin }),
                            `${user.username} is now ${user.isAdmin ? "a member" : "an admin"}.`,
                            "Could not change the role."
                          )
                        }
                        className={ghostButton}
                      >
                        {user.isAdmin ? "Revoke admin" : "Make admin"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetId(resetId === user.id ? null : user.id);
                          setResetPassword("");
                        }}
                        className={ghostButton}
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        disabled={self}
                        onClick={() => handleDelete(user)}
                        className={ghostButton}
                        aria-label={`Delete ${user.username}`}
                      >
                        Delete
                      </button>
                    </div>
                    {resetId === user.id ? (
                      <form
                        onSubmit={(event) => void handleReset(event, user)}
                        className="mt-2 flex gap-2"
                      >
                        <input
                          type="password"
                          value={resetPassword}
                          onChange={(event) => setResetPassword(event.target.value)}
                          aria-label={`New password for ${user.username}`}
                          minLength={8}
                          className={inputClass}
                          required
                        />
                        <button type="submit" className={primaryButton}>
                          Save
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className={panelClass}>
        <h2 className={headingClass}>Add user</h2>
        <form onSubmit={handleCreate} className="mt-4 space-y-4">
          <label className={labelClass}>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
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
              autoComplete="new-password"
              minLength={8}
              className={`mt-2 ${inputClass}`}
              required
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-[var(--gray-text)]">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(event) => setIsAdmin(event.target.checked)}
            />
            Admin
          </label>
          <button type="submit" className={primaryButton}>
            Add user
          </button>
        </form>
      </section>
    </div>
  );
};
