interface Props {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PageShell({ title, subtitle, children }: Props) {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl lg:text-3xl font-display font-bold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {children ?? (
        <div className="card border-dashed p-10 text-center">
          <h3 className="section-title">В разработке</h3>
        </div>
      )}
    </div>
  );
}
