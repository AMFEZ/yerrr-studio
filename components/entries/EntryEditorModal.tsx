"use client";

import { useState } from "react";
import type { Entry, EntryStatus, Meaning } from "@/types/entry";
import { entryTypes } from "@/types/entry";

export function EntryEditorModal({
  entry,
  onClose,
  onSave,
}: {
  entry: Entry;
  onClose: () => void;
  onSave: (entry: Entry) => void;
}) {
  const [draft, setDraft] = useState<Entry>(entry);

  function updateMeaning(meaningId: number, updates: Partial<Meaning>) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      meanings: currentDraft.meanings.map((meaning) =>
        meaning.id === meaningId ? { ...meaning, ...updates } : meaning
      ),
    }));
  }

  function addMeaning() {
    setDraft((currentDraft) => ({
      ...currentDraft,
      meanings: [
        ...currentDraft.meanings,
        {
          id: `temp-${Date.now()}`,
          title: "",
          definition: "",
          example: "",
        },
      ],
    }));
  }

  function removeMeaning(meaningId: number) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      meanings:
        currentDraft.meanings.length === 1
          ? currentDraft.meanings
          : currentDraft.meanings.filter((meaning) => meaning.id !== meaningId),
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-yellow-400">
              Entry Details
            </p>
            <h2 className="mt-2 text-3xl font-black">{draft.word}</h2>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-bold hover:bg-neutral-700"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Field label="Word or Phrase">
            <input
              value={draft.word}
              onChange={(event) =>
                setDraft({ ...draft, word: event.target.value })
              }
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
            />
          </Field>

          <Field label="Type">
            <select
              value={draft.type}
              onChange={(event) =>
                setDraft({ ...draft, type: event.target.value })
              }
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
            >
              {entryTypes.map((entryType) => (
                <option key={entryType}>{entryType}</option>
              ))}
            </select>
          </Field>

          <Field label="Status">
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  status: event.target.value as EntryStatus,
                })
              }
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
            >
              <option>Draft</option>
              <option>Needs Review</option>
              <option>Published</option>
            </select>
          </Field>
        </div>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black">Meanings</h3>
              <p className="text-sm text-neutral-500">
                Add one section for each distinct meaning.
              </p>
            </div>

            <button
              onClick={addMeaning}
              className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300"
            >
              ➕ Add Meaning
            </button>
          </div>

          <div className="space-y-4">
            {draft.meanings.map((meaning, index) => (
              <div
                key={meaning.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5"
              >
                <div className="mb-4 flex items-center justify-between gap-4">
                  <p className="font-black text-yellow-400">
                    Meaning #{index + 1}
                  </p>

                  <button
                    onClick={() => removeMeaning(meaning.id)}
                    disabled={draft.meanings.length === 1}
                    className="rounded-lg bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-300 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>

                <div className="space-y-4">
                  <Field label="Meaning Title">
                    <input
                      value={meaning.title}
                      onChange={(event) =>
                        updateMeaning(meaning.id, {
                          title: event.target.value,
                        })
                      }
                      placeholder="Money, Honesty, Shooting..."
                      className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
                    />
                  </Field>

                  <Field label="Definition">
                    <textarea
                      value={meaning.definition}
                      onChange={(event) =>
                        updateMeaning(meaning.id, {
                          definition: event.target.value,
                        })
                      }
                      placeholder="One dollar."
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
                    />
                  </Field>

                  <Field label="Example Sentence">
                    <textarea
                      value={meaning.example}
                      onChange={(event) =>
                        updateMeaning(meaning.id, {
                          example: event.target.value,
                        })
                      }
                      placeholder="Lemme borrow a buck."
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Field label="Editorial Notes">
          <textarea
            value={draft.notes}
            onChange={(event) =>
              setDraft({ ...draft, notes: event.target.value })
            }
            placeholder="Add context, uncertainty, borough notes, or reminders."
            rows={4}
            className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
          />
        </Field>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => onSave(draft)}
            className="flex-1 rounded-xl bg-yellow-400 px-4 py-3 font-black text-black hover:bg-yellow-300"
          >
            Save Changes
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-bold text-neutral-300">
      {label}
      {children}
    </label>
  );
}