type ComingSoonPageProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export default function ComingSoonPage({ eyebrow, title, description }: ComingSoonPageProps) {
  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">{eyebrow}</p>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">{description}</p>
      <div className="mt-8 rounded-lg border border-border bg-surface px-5 py-8 text-sm text-muted">
        Coming soon.
      </div>
    </div>
  );
}
