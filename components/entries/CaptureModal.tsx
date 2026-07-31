"use client";

import { useState } from "react";
import { entryTypes } from "@/types/entry";

export function CaptureModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (word: string, type: string) => void;
}) {
  const [word, setWord] = useState("");
  const [type, setType] = useState("Word");

  function handleSave() {
    if (!word.trim()) return;
    onSave(word, type);
    setWord("");
    setType("Word");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
        <h2 className="text-2xl font-black">Capture Slang</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Save the word now. Define it later.
        </p>

        <label className="mt-6 block text-sm font-bold text-neutral-300">
          Word or Phrase
        </label>
        <input
          value={word}
          onChange={(event) => setWord(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSave();
          }}
          className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
        />

        <label className="mt-4 block text-sm font-bold text-neutral-300">
          Type
        </label>
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
        >
          {entryTypes.map((entryType) => (
            <option key={entryType}>{entryType}</option>
          ))}
        </select>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            className="flex-1 rounded-xl bg-yellow-400 px-4 py-3 font-black text-black hover:bg-yellow-300"
          >
            Save Draft
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-neutral-800 px-4 py-3 font-bold text-white hover:bg-neutral-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}