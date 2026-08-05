import { useRef, useState, useEffect } from 'react';
import { Button } from '@components/ui/button';
import { X, Check } from 'lucide-react';

export default function SignaturePad({ onSave, onClear, hasSignature }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Configure drawing style
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setIsEmpty(false);
  };

  const draw = (e) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onClear?.();
  };

  const save = () => {
    const canvas = canvasRef.current;
    canvas.toBlob((blob) => {
      const file = new File([blob], `signature-${Date.now()}.png`, { type: 'image/png' });
      onSave?.(file);
    }, 'image/png');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-24 border border-[hsl(var(--border))] rounded-md bg-white cursor-crosshair touch-none"
          style={{ width: '200px', height: '96px' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {isEmpty && !hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-[hsl(var(--muted-foreground))]">
            חתום כאן
          </div>
        )}
        {hasSignature && (
          <div className="absolute top-2 left-2">
            <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-md">
              <Check className="h-3 w-3" />
              נשמר
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clear}
          disabled={isEmpty && !hasSignature}
          className="text-xs"
        >
          <X className="h-3 w-3 ml-1" />
          נקה
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={save}
          disabled={isEmpty}
          className="text-xs"
        >
          <Check className="h-3 w-3 ml-1" />
          שמור חתימה
        </Button>
      </div>
    </div>
  );
}
