"use client";

import { useState, type FormEvent } from "react";
import type { BoardData } from "@/lib/kanban";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatSidebarProps = {
  onBoard: (board: BoardData) => void;
};

export const ChatSidebar = ({ onBoard }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || pending) {
      return;
    }
    const history = messages;
    setMessages((current) => [...current, { role: "user", content: message }]);
    setDraft("");
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      if (!response.ok) {
        setError("Could not send the message.");
        return;
      }
      const data = (await response.json()) as {
        reply: string;
        board: BoardData | null;
      };
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.reply },
      ]);
      if (data.board) {
        onBoard(data.board);
      }
    } catch {
      setError("Could not send the message.");
    } finally {
      setPending(false);
    }
  };

  return (
    <aside className="flex w-full shrink-0 flex-col rounded-3xl border border-[var(--stroke)] border-t-4 border-t-[var(--primary-blue)] bg-white p-5 shadow-[var(--shadow)] xl:w-80">
      <h2 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
        Assistant
      </h2>
      <ul className="mt-4 flex max-h-80 flex-col gap-3 overflow-auto">
        {messages.map((item, index) => (
          <li
            key={`${item.role}-${index}`}
            className={
              item.role === "user"
                ? "text-sm text-[var(--navy-dark)]"
                : "text-sm text-[var(--primary-blue)]"
            }
          >
            {item.content}
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label className="block text-sm font-semibold text-[var(--gray-text)]">
          Message
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            disabled={pending}
            className="mt-2 w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none"
            required
          />
        </label>
        {pending ? <p className="text-sm text-[var(--gray-text)]">Sending...</p> : null}
        {error ? (
          <p className="text-sm text-[var(--navy-dark)]" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-[var(--secondary-purple)] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </aside>
  );
};
