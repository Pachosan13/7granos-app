import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface RealtimeStatusIndicatorProps {
  connected: boolean;
  lastUpdate: Date | null;
  error: string | null;
  onReconnect?: () => void;
  compact?: boolean;
}

export function RealtimeStatusIndicator({
  connected,
  lastUpdate,
  error,
  onReconnect,
  compact = false,
}: RealtimeStatusIndicatorProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {connected ? (
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <Wifi className="h-4 w-4" />
            <span className="text-xs font-medium">Live</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <RefreshCw className="h-4 w-4" />
            <span className="text-xs font-medium">Manual</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
          connected
            ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
            : error
            ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
            : 'bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400'
        }`}
      >
        {connected ? (
          <>
            <div className="relative">
              <Wifi className="h-4 w-4" />
              <div className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            </div>
            <span>Sincronización en vivo</span>
          </>
        ) : error ? (
          <>
            <AlertCircle className="h-4 w-4" />
            <span>Error de conexión</span>
            {onReconnect && (
              <button
                onClick={onReconnect}
                className="ml-1 p-0.5 hover:bg-red-100 dark:hover:bg-red-800/30 rounded transition-colors"
                aria-label="Reintentar conexión"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            <span>Desconectado</span>
            {onReconnect && (
              <button
                onClick={onReconnect}
                className="ml-1 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800/30 rounded transition-colors"
                aria-label="Reintentar conexión"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {lastUpdate && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Actualizado {formatDistanceToNow(lastUpdate, { addSuffix: true, locale: undefined })}
        </div>
      )}

      {error && !connected && (
        <div className="text-xs text-red-600 dark:text-red-400 max-w-xs truncate" title={error}>
          {error}
        </div>
      )}
    </div>
  );
}
