export function StatCard({
  emoji,
  label,
  value,
}: {
  emoji: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="text-3xl">{emoji}</div>
      <p className="mt-4 text-3xl font-black">{value}</p>
      <p className="text-sm text-neutral-400">{label}</p>
    </div>
  );
}