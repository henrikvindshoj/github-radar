import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center justify-center text-center p-6 text-slate-500 dark:text-slate-400">
      {icon && <div className="mb-2">{icon}</div>}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {description && <p className="text-xs mt-1">{description}</p>}
    </div>
  );
}
