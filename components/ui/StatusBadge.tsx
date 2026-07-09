import type { EntryStatus } from "@/types/entry";

export function StatusBadge({ status }: { status: EntryStatus }) {
  const styles = {
    Draft: "bg-yellow-400 text-black",
    "Needs Review": "bg-orange-500 text-black",
    Published: "bg-emerald-500 text-black",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${styles[status]}`}>
      {status}
    </span>
  );
}