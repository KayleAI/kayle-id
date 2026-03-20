import type { ReactNode } from "react";

type LegalSectionProps = {
  title: string;
  children: ReactNode;
};

type LegalListProps = {
  items: string[];
};

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section className="space-y-4">
      <h2 className="font-light text-2xl text-neutral-900">{title}</h2>
      <div className="space-y-4 text-neutral-600 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ items }: LegalListProps) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-neutral-600 leading-relaxed">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
