/**
 * Restrained skeleton preserving Home's layout while data loads — never
 * fake numbers, never a full-dashboard spinner (per the phase brief).
 */
export default function HomeLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-10" aria-busy="true" aria-label="Loading your financial position">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-56 rounded-md bg-surface-muted" />
        <div className="h-4 w-40 rounded-md bg-surface-muted" />
      </div>
      <div className="h-32 rounded-2xl bg-surface-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="h-24 rounded-2xl bg-surface-muted" />
        <div className="h-24 rounded-2xl bg-surface-muted" />
      </div>
      <div className="h-48 rounded-2xl bg-surface-muted" />
      <div className="h-40 rounded-2xl bg-surface-muted" />
    </div>
  );
}
