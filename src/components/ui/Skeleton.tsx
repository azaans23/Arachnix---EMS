type SkeletonProps = {
  className?: string;
};

/** Neutral pulse block for loading placeholders. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-border/70 dark:bg-border/50 ${className}`}
      aria-hidden
    />
  );
}

type TableSkeletonProps = {
  columns?: number;
  rows?: number;
  /** Optional right-aligned last column (actions). */
  actions?: boolean;
};

/** Table-shaped skeleton matching employees / audit log layouts. */
export function TableSkeleton({ columns = 4, rows = 8, actions = true }: TableSkeletonProps) {
  const colCount = Math.max(1, columns);
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-surface shadow-panel"
      role="status"
      aria-label="Loading table"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-canvas/80">
              {Array.from({ length: colCount }).map((_, index) => (
                <th
                  key={`h-${index}`}
                  className={`px-5 py-3.5 ${actions && index === colCount - 1 ? 'text-right' : ''}`}
                >
                  <Skeleton
                    className={`h-3 ${actions && index === colCount - 1 ? 'ml-auto w-16' : 'w-20'}`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={`r-${rowIndex}`}>
                {Array.from({ length: colCount }).map((_, colIndex) => (
                  <td
                    key={`c-${rowIndex}-${colIndex}`}
                    className={`px-5 py-3.5 ${
                      actions && colIndex === colCount - 1 ? 'text-right' : ''
                    }`}
                  >
                    {actions && colIndex === colCount - 1 ? (
                      <div className="inline-flex items-center justify-end gap-2">
                        <Skeleton className="h-7 w-16" />
                        <Skeleton className="h-8 w-8 rounded-md" />
                      </div>
                    ) : (
                      <Skeleton
                        className={`h-4 ${
                          colIndex === 0 ? 'w-36' : colIndex === 1 ? 'w-44' : 'w-24'
                        }`}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Compact form field grid skeleton for profile / create flows. */
export function FormSkeleton({ fields = 10 }: { fields?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2"
      role="status"
      aria-label="Loading form"
    >
      {Array.from({ length: fields }).map((_, index) => (
        <div
          key={`f-${index}`}
          className={`flex flex-col gap-2 ${index >= fields - 2 ? 'md:col-span-2' : ''}`}
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <div className="flex justify-end gap-3 md:col-span-2 pt-2">
        <Skeleton className="h-10 w-28" />
      </div>
    </div>
  );
}
