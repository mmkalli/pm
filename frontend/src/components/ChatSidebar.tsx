"use client";

import { useState, type FormEvent } from "react";
import { api, errorText, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { errorClass, inputClass, labelClass, primaryButton } from "@/components/ui";

type ChatSidebarProps = {
  boardId: number;
  onBoard: (board: BoardData) => void;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
};

export const ChatSidebar = ({ boardId, onBoard, pending, onPendingChange }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
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
    onPendingChange(true);
    setError("");
    try {
      const data = await api<{ reply: string; board: BoardData | null }>(
        `/api/boards/${boardId}/chat`,
        "POST",
        { message, history }
      );
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
      if (data.board) {
        onBoard(data.board);
      }
    } catch (caught) {
      setError(errorText(caught, "Could not send the message."));
    } finally {
      onPendingChange(false);
    }
  };

  return (
    <aside className="flex w-full shrink-0 flex-col rounded-3xl border border-[var(--stroke)] border-t-4 border-t-[var(--primary-blue)] bg-white p-5 shadow-[var(--shadow)] 2xl:w-80">
      <h2 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">Assistant</h2>
      <p className="mt-1 text-xs text-[var(--gray-text)]">
        Ask it to add, edit, move, or remove cards and columns on this board.
      </p>
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
        <label className={labelClass}>
          Message
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            disabled={pending}
            className={`mt-2 ${inputClass}`}
            required
          />
        </label>
        {pending ? <p className="text-sm text-[var(--gray-text)]">Sending...</p> : null}
        {error ? (
          <p className={errorClass} role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className={primaryButton}>
          Send
        </button>
      </form>
    </aside>
  );
};
