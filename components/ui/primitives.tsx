import { cn } from "@/lib/utils";

/**
 * Строительные блоки интерфейса. Собраны в одном месте, чтобы
 * плотность, отступы и типографика не разъезжались между экранами.
 */

// ═══════════════════════════════════════════════════════════════════
// Заголовок экрана
// ═══════════════════════════════════════════════════════════════════
export function PageHeader({
  title,
  meta,
  subtitle,
  actions,
}: {
  title: string;
  /** Короткая приписка рядом с заголовком: «46 записей» */
  meta?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-xl lg:text-2xl font-display font-semibold tracking-tight text-ink-900">
            {title}
          </h1>
          {meta && <span className="text-xs text-ink-400 num">{meta}</span>}
        </div>
        {subtitle && <p className="text-sm text-ink-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Панель
// ═══════════════════════════════════════════════════════════════════
export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("panel", className)}>{children}</div>;
}

export function PanelHead({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="panel-head">
      <span className="label-micro">{title}</span>
      {right}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Число с приглушённой единицей
// ═══════════════════════════════════════════════════════════════════
export function Num({
  value,
  unit,
  size = "md",
  tone = "default",
  className,
}: {
  value: string;
  unit?: string;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "default" | "muted" | "success" | "danger" | "warning" | "brand";
  className?: string;
}) {
  const sizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-lg",
    xl: "text-2xl lg:text-3xl",
  }[size];

  const tones = {
    default: "text-ink-900",
    muted: "text-ink-500",
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
    brand: "text-brand-700",
  }[tone];

  return (
    <span className={cn("num font-display font-semibold whitespace-nowrap", sizes, tones, className)}>
      {value}
      {unit && <span className="font-normal text-ink-400 ml-0.5">{unit}</span>}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Полоса метрик
// ═══════════════════════════════════════════════════════════════════
export type Metric = {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  hintTone?: "success" | "danger" | "muted";
  tone?: "default" | "success" | "danger" | "brand";
};

export function StatStrip({
  items,
  right,
}: {
  items: Metric[];
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-stretch">
      {items.map((m, i) => (
        <div
          key={m.label}
          className={cn(
            "flex-1 min-w-[130px] px-4 py-3.5",
            i < items.length - 1 && "sm:border-r border-line",
          )}
        >
          <div className="label-micro">{m.label}</div>
          <div className="mt-1">
            <Num value={m.value} unit={m.unit} size="lg" tone={m.tone ?? "default"} />
          </div>
          {m.hint && (
            <div
              className={cn(
                "text-2xs mt-0.5",
                m.hintTone === "success" && "text-success",
                m.hintTone === "danger" && "text-danger",
                (!m.hintTone || m.hintTone === "muted") && "text-ink-400",
              )}
            >
              {m.hint}
            </div>
          )}
        </div>
      ))}
      {right && (
        <div className="px-4 py-3.5 border-line sm:border-l flex items-center">{right}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Спарклайн
// ═══════════════════════════════════════════════════════════════════
export function Sparkline({
  values,
  width = 92,
  height = 28,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  label?: string;
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const lastX = width;
  const lastY = height - ((values[values.length - 1] - min) / span) * height;

  return (
    <div>
      {label && <div className="label-micro mb-1.5">{label}</div>}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible"
        aria-hidden="true"
      >
        <polyline
          points={pts}
          fill="none"
          className="stroke-brand-500"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={lastX} cy={lastY} r="2" className="fill-brand-500" />
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Точка статуса
// ═══════════════════════════════════════════════════════════════════
export function StatusDot({ className }: { className?: string }) {
  return <span className={cn("size-1.5 rounded-full shrink-0", className)} />;
}

// ═══════════════════════════════════════════════════════════════════
// Тег
// ═══════════════════════════════════════════════════════════════════
export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "warning";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded",
        tone === "neutral" && "border border-line-strong text-ink-500",
        tone === "brand" && "bg-brand-50 text-brand-800",
        tone === "warning" && "bg-warning-bg text-warning",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Пустое состояние
// ═══════════════════════════════════════════════════════════════════
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center">
      {icon && <div className="text-ink-300 flex justify-center mb-3">{icon}</div>}
      <h3 className="font-display font-semibold text-ink-900">{title}</h3>
      {hint && <p className="text-sm text-ink-500 mt-1 max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
