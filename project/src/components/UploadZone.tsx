import { DragEvent, ReactNode, useCallback, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface UploadZoneProps {
  accept?: string;
  disabled?: boolean;
  description?: ReactNode;
  onFileSelected: (file: File) => void;
}

export function UploadZone({ accept, disabled = false, description, onFileSelected }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;

    if (event.type === 'dragenter' || event.type === 'dragover') {
      setIsDragging(true);
    } else if (event.type === 'dragleave') {
      setIsDragging(false);
    }
  }, [disabled]);

  const handleDrop = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;

    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  }, [disabled, onFileSelected]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFileSelected(file);
  }, [onFileSelected]);

  const stateClass = disabled
    ? 'cursor-not-allowed border-dashed border-slate-200 bg-slate-50'
    : isDragging
      ? 'border-emerald-400 bg-emerald-50'
      : 'border-dashed border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/50';

  return (
    <label
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border px-6 py-12 text-center transition-colors ${stateClass}`}
    >
      <UploadCloud className="h-10 w-10 text-emerald-500" />
      <div className="text-sm font-medium text-slate-700">
        Arrastra y suelta tu archivo o <span className="text-emerald-600">haz clic para buscarlo</span>
      </div>
      {description && <div className="text-xs text-slate-500">{description}</div>}

      <input
        type="file"
        className="hidden"
        accept={accept}
        disabled={disabled}
        onChange={handleInputChange}
      />
    </label>
  );
}
