// src/pages/Dashboard.tsx
import React, { Component, Suspense } from 'react';

/** ErrorBoundary: evita que un error dentro de Dashboard tumbe toda la app */
class DashboardBoundary extends Component<{ children: React.ReactNode }, { error?: any }> {
  constructor(props: any) {
    super(props);
    this.state = { error: undefined };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    console.error('💥 Error dentro de Dashboard:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, background: '#fde68a', borderRadius: 8 }}>
          <h3 style={{ color: '#b91c1c', marginTop: 0 }}>Error en Dashboard</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error)}</pre>
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
