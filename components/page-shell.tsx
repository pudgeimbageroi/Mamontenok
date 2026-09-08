import { PageHeader, Panel, EmptyState } from "@/components/ui/primitives";

interface Props {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PageShell({ title, subtitle, children }: Props) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      {children ?? (
        <Panel>
          <EmptyState title="Здесь пока пусто" hint="Раздел появится позже." />
        </Panel>
      )}
    </div>
  );
}
