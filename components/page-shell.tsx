interface Props {
  title: string;
  subtitle?: string;
  sprint?: string;
  children?: React.ReactNode;
}

export function PageShell({ title, subtitle, sprint, children }: Props) {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight text-ink-900">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-ink-500">{subtitle}</p>
        )}
      </div>

      {children ?? (
        <div className="bg-white border border-ink-200 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🚧</div>
          <h3 className="font-display font-semibold text-ink-900 mb-1">В разработке</h3>
          {sprint && <p className="text-sm text-ink-500">Будет готово в спринте {sprint}</p>}
        </div>
      )}
    </div>
  );
}
