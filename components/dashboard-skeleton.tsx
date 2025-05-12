export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4 h-96 rounded-lg bg-muted animate-pulse" />
        <div className="col-span-3 h-96 rounded-lg bg-muted animate-pulse" />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-3 h-96 rounded-lg bg-muted animate-pulse" />
        <div className="col-span-4 h-96 rounded-lg bg-muted animate-pulse" />
      </div>
    </div>
  )
}
