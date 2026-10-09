"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, errorText, type Member } from "@/lib/api";
import { errorClass, inputClass, primaryButton } from "@/components/ui";

type MembersPanelProps = {
  boardId: number;
  owner: string;
  isOwner: boolean;
};

export const MembersPanel = ({ boardId, owner, isOwner }: MembersPanelProps) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Member[]>(`/api/boards/${boardId}/members`)
      .then(setMembers)
      .catch(() => setError("Could not load members."));
  }, [boardId]);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = username.trim();
    if (!name) {
      return;
    }
    try {
      const member = await api<Member>(`/api/boards/${boardId}/members`, "POST", {
        username: name,
      });
      setMembers((current) => [...current, member]);
      setUsername("");
      setError("");
    } catch (caught) {
      setError(errorText(caught, "Could not add the member."));
    }
  };

  const handleRemove = async (member: Member) => {
    try {
      await api(`/api/boards/${boardId}/members/${member.id}`, "DELETE");
    } catch {
      setError("Could not remove the member.");
      return;
    }
    setMembers((current) => current.filter((item) => item.id !== member.id));
    setError("");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="members">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
        Members
      </span>
      <span className="rounded-full bg-[var(--navy-dark)] px-3 py-1 text-xs font-semibold text-white">
        {owner} (owner)
      </span>
      {members.map((member) => (
        <span
          key={member.id}
          className="flex items-center gap-1 rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--navy-dark)]"
        >
          {member.username}
          {isOwner ? (
            <button
              type="button"
              onClick={() => void handleRemove(member)}
              aria-label={`Remove member ${member.username}`}
              className="text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
            >
              &times;
            </button>
          ) : null}
        </span>
      ))}
      {isOwner ? (
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            aria-label="Add member by username"
            className={`${inputClass} w-40 py-1`}
          />
          <button type="submit" className={`${primaryButton} py-1.5`}>
            Share
          </button>
        </form>
      ) : null}
      {error ? (
        <p className={errorClass} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};
