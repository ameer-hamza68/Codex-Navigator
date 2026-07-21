import type { ReactNode } from "react";

export function SectionHeading({ eyebrow, title, children, action }: Readonly<{ eyebrow: string; title: string; children: ReactNode; action?: ReactNode }>) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="eyebrow mb-2">{eyebrow}</div><h2 className="section-title">{title}</h2><p className="section-copy max-w-2xl">{children}</p></div>
      {action}
    </div>
  );
}
