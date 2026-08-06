import { useRef, useState, useEffect } from 'react';
import { Button } from '@components/ui/button';
import { X, Check, Maximize2, Minimize2 } from 'lucide-react';

function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

export default function SignaturePad({ onSave, onClear, hasSignature }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  // Re-run on every expand/collapse toggle - switching modes swaps in a
  // differently-sized canvas element, which needs its own pixel dimensions set.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupCanvas(canvas);
  }, [isExpanded]);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getPoint(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setIsEmpty(false);
  };

  const draw = (e) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getPoint(e);

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
    setIsExpanded(false);
  };

  const canvasProps = {
    ref: canvasRef,
    className: 'w-full h-full bg-white cursor-crosshair touch-none',
    onMouseDown: startDrawing,
    onMouseMove: draw,
    onMouseUp: stopDrawing,
    onMouseLeave: stopDrawing,
    onTouchStart: startDrawing,
    onTouchMove: draw,
    onTouchEnd: stopDrawing,
  };

  if (isExpanded) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col" dir="rtl">
        <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">חתום כאן</span>
          <Button type="button" variant="ghost" size="icon" onClick={() => setIsExpanded(false)}>
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative flex-1">
          <canvas {...canvasProps} />
          {isEmpty && !hasSignature && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-base text-[hsl(var(--muted-foreground))]">
              חתום כאן
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-[hsl(var(--border))]">
          <Button
            type="button"
            variant="outline"
            onClick={clear}
            disabled={isEmpty && !hasSignature}
            className="flex-1"
          >
            <X className="h-4 w-4 ml-1" />
            נקה
          </Button>
          <Button type="button" variant="default" onClick={save} disabled={isEmpty} className="flex-1">
            <Check className="h-4 w-4 ml-1" />
            שמור חתימה
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <canvas
          {...canvasProps}
          className="w-full h-24 border border-[hsl(var(--border))] rounded-md bg-white cursor-crosshair touch-none"
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
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="absolute bottom-1.5 left-1.5 p-1.5 rounded-md bg-white/90 border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-white"
          aria-label="הגדל אזור חתימה"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
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
