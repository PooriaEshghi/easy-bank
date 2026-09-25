import { Component, Suspense, type ReactNode } from "react";

type BoundaryProps = {
  title: string;
  children: ReactNode;
};

type BoundaryState = {
  failed: boolean;
};

class PanelBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <p className="fallback">Remote {this.props.title} non disponibile.</p>;
    }
    return this.props.children;
  }
}

type RemotePanelProps = {
  title: string;
  children: ReactNode;
};

export function RemotePanel({ title, children }: RemotePanelProps) {
  return (
    <section className="panel" aria-label={title}>
      <PanelBoundary title={title}>
        <Suspense fallback={<p>Caricamento {title}…</p>}>{children}</Suspense>
      </PanelBoundary>
    </section>
  );
}
