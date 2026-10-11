export default function StatCard({ label, value, hint }) {
  return (
    <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] p-4 text-center">
      <div className="text-2xl font-bold text-[hsl(var(--foreground))]">{value}</div>
      <div className="text-sm text-[hsl(var(--muted-foreground))]">{label}</div>
      {hint && <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{hint}</div>}
    </div>
  );
}
