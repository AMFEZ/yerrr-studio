"use client";

import { useMemo, useState, type FormEvent } from "react";

import type {
  EditorialTaxonomyKind,
  EditorialTaxonomyOption,
} from "@/types/editorialTaxonomy";

type EditorialTaxonomyManagerProps = {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  tones: string[];
  customOptions: EditorialTaxonomyOption[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  onAddOption: (
    kind: EditorialTaxonomyKind,
    label: string,
  ) => Promise<void>;
  onRemoveOption: (optionId: string) => Promise<void>;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to update the option.";
}

export function EditorialTaxonomyManager({
  isOpen,
  onClose,
  categories,
  tones,
  customOptions,
  isLoading,
  isSaving,
  error,
  onAddOption,
  onRemoveOption,
}: EditorialTaxonomyManagerProps) {
  const [activeKind, setActiveKind] =
    useState<EditorialTaxonomyKind>("category");
  const [label, setLabel] = useState("");
  const [localError, setLocalError] = useState("");
  const [message, setMessage] = useState("");

  const currentOptions = activeKind === "category" ? categories : tones;

  const currentCustomOptions = useMemo(
    () =>
      customOptions
        .filter((option) => option.kind === activeKind)
        .sort((a, b) =>
          a.label.localeCompare(b.label, undefined, {
            sensitivity: "base",
          }),
        ),
    [activeKind, customOptions],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    setMessage("");

    try {
      await onAddOption(activeKind, label);
      setMessage(
        `${activeKind === "category" ? "Category" : "Tone"} added.`,
      );
      setLabel("");
    } catch (addError) {
      setLocalError(getErrorMessage(addError));
    }
  }

  async function handleRemove(option: EditorialTaxonomyOption) {
    const confirmed = window.confirm(
      `Remove “${option.label}” from your custom ${option.kind}s? Existing entries will keep their saved value.`,
    );

    if (!confirmed) {
      return;
    }

    setLocalError("");
    setMessage("");

    try {
      await onRemoveOption(option.id);
      setMessage(`“${option.label}” was removed.`);
    } catch (removeError) {
      setLocalError(getErrorMessage(removeError));
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[140] bg-black/80 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close category and tone manager"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <aside className="absolute bottom-0 right-0 flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-neutral-800 bg-neutral-950 shadow-2xl md:bottom-auto md:top-0 md:h-full md:max-h-none md:max-w-xl md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0">
        <header className="shrink-0 border-b border-neutral-800 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-400">
                Editorial Taxonomy
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Categories & Tones
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Add reusable options. Lists are alphabetized automatically.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 font-black text-neutral-300"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-2">
            {(["category", "tone"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setActiveKind(kind);
                  setLocalError("");
                  setMessage("");
                }}
                className={`rounded-xl px-4 py-3 text-sm font-black ${
                  activeKind === kind
                    ? "bg-yellow-400 text-black"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {kind === "category" ? "Categories" : "Tones"}
              </button>
            ))}
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
          >
            <label className="block text-sm font-bold text-neutral-300">
              Add {activeKind === "category" ? "Category" : "Tone"}
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={
                  activeKind === "category"
                    ? "Example: Status/Reputation"
                    : "Example: Indirect"
                }
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-yellow-400"
              />
            </label>

            <button
              type="submit"
              disabled={isSaving || !label.trim()}
              className="mt-3 w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? "Saving..." : "Add Option"}
            </button>
          </form>

          {(localError || error) && (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold text-red-100">
              {localError || error}
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-2xl border border-green-400/20 bg-green-400/10 p-4 text-sm font-bold text-green-100">
              {message}
            </div>
          )}

          <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-black text-white">
                  All {activeKind === "category" ? "Categories" : "Tones"}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  {currentOptions.length} available options
                </p>
              </div>

              {isLoading && (
                <span className="text-xs font-black text-neutral-500">
                  Loading…
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {currentOptions.map((option) => (
                <span
                  key={option}
                  className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs font-black text-neutral-300"
                >
                  {option}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="font-black text-white">Your Custom Options</p>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              Built-in options remain available. Only options you added can be removed.
            </p>

            {currentCustomOptions.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-neutral-700 p-4 text-sm text-neutral-500">
                No custom {activeKind === "category" ? "categories" : "tones"} yet.
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {currentCustomOptions.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                  >
                    <p className="font-bold text-white">{option.label}</p>
                    <button
                      type="button"
                      onClick={() => void handleRemove(option)}
                      disabled={isSaving}
                      className="rounded-lg border border-red-400/20 px-3 py-2 text-xs font-black text-red-300 hover:bg-red-400/10 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

export default EditorialTaxonomyManager;
