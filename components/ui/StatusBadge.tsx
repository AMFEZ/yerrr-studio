import type { EntryStatus } from "@/types/entry";

const styles: Record<EntryStatus, string> = {
  Draft: "bg-neutral-800 text-neutral-300",
  "Needs Review": "bg-orange-500/20 text-orange-300",
  Verified: "bg-green-500/20 text-green-300",
  Published: "bg-blue-500/20 text-blue-300",
  Archived: "bg-red-500/20 text-red-300",
};

export function StatusBadge({ status }: { status: EntryStatus }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  );
}