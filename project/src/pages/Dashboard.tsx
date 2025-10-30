import React, { Component, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

type BoundaryProps = { children: ReactNode };
type BoundaryState = { error?: Error };

/** ErrorBoundary: evita que un error dentro de Dashboard tumbe toda la app */
class DashboardBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('💥 Error dentro de Dashboard:', error, info);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ padding: 24, background: '#fde68a', borderRadius: 8 }}>
          <h3 style={{ color: '#b91c1c', marginTop: 0 }}>Error en Dashboard</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{error.message ?? String(error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Carga perezosa del contenido real del Dashboard */
const DashboardInner = React.lazy(() => import('./DashboardInner'));

/** Export final: UI protegida + fallback de carga */
export default function Dashboard() {
  return (
    <DashboardBoundary>
      <Suspense fallback={<div style={{ padding: 24 }}>Cargando tablero…</div>}>
        <DashboardInner />
      </Suspense>
    </DashboardBoundary>
  );
}
