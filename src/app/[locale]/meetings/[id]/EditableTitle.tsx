"use client";

import { useRef, useState, useTransition } from "react";
import { updateMeetingTitle } from "@/actions/meeting";

export default function EditableTitle({
  meetingId,
  title,
  fallback,
}: {
  meetingId: string;
  title: string | null;
  fallback: string;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleClick() {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    startTransition(async () => {
      await updateMeetingTitle(meetingId, formData);
      setEditing(false);
    });
  }

  function handleBlur(e: React.FocusEvent<HTMLFormElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} onBlur={handleBlur} className="flex items-center gap-2">
        <input
          ref={inputRef}
          name="title"
          defaultValue={title ?? ""}
          placeholder={fallback}
          disabled={pending}
          className="text-xl font-bold text-white bg-gray-800 border border-indigo-600 rounded-lg px-3 py-1 focus:outline-none w-72"
          autoFocus
        />
        <button type="submit" disabled={pending} className="text-xs text-indigo-400 hover:text-indigo-200">
          ✓
        </button>
      </form>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="text-left group flex items-center gap-2"
      title="Cliquer pour renommer"
    >
      <h1 className="text-xl font-bold text-white capitalize group-hover:text-indigo-300 transition-colors">
        {title ?? fallback}
      </h1>
      <span className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm">✎</span>
    </button>
  );
}
