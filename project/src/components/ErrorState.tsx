interface ErrorStateProps {
  code: string;
  message?: string;
  retry?: boolean;
  onRetry?: () => void;
}

export const ErrorState = ({ code, message, retry, onRetry }: ErrorStateProps) => {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 text-red-600 text-2xl font-semibold">
        !
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold text-red-700">Error {code}</p>
        <p className="text-sm text-red-500 max-w-md mx-auto">
          {message ?? 'Ocurrió un problema cargando los datos del tablero. Intenta nuevamente más tarde.'}
        </p>
      </div>
      {retry ? (
        <button
          onClick={onRetry}
          className="inline-flex items-center px-4 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition"
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
};
