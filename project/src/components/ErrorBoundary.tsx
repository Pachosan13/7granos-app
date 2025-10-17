import { Component, ReactNode, ErrorInfo } from 'react';

interface Props { children: ReactNode }
interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('⚠️ Runtime error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-sand p-4">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-2xl font-bold text-bean mb-2">Error en la aplicación</h2>
              <p className="text-slate7g mb-4">
                Ocurrió un error inesperado. Por favor, intenta recargar la página.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-left">
                <p className="font-semibold text-red-800 mb-2">Error:</p>
                <p className="text-red-700 text-sm font-mono mb-2">{this.state.error.toString()}</p>
                {this.state.errorInfo && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-red-600 text-sm font-medium">
                      Ver detalles técnicos
                    </summary>
                    <pre className="mt-2 text-xs text-red-600 overflow-auto max-h-40 whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="px-6 py-3 bg-accent text-white rounded-xl font-medium hover:bg-accent/90 transition-colors"
              >
                Recargar página
              </button>
              <button
                onClick={() => window.location.href = '/login'}
                className="px-6 py-3 bg-sand text-bean rounded-xl font-medium hover:bg-sand/80 transition-colors"
              >
                Ir a inicio de sesión
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
