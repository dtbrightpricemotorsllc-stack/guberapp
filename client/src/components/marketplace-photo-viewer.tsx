import { useEffect, useRef, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  photos: string[];
  initialIndex?: number;
  onClose: () => void;
}

function getDistance(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function MarketplacePhotoViewer({ photos, initialIndex = 0, onClose }: Props) {
  const [idx, setIdx] = useState(Math.max(0, Math.min(initialIndex, photos.length - 1)));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const panStart = useRef({ x: 0, y: 0 });
  const pinchDist = useRef(0);
  const pinchZoom = useRef(1);
  const lastTap = useRef(0);
  const lastTapPos = useRef({ x: 0, y: 0 });

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const prev = useCallback(() => {
    if (zoom > 1) return;
    setIdx(i => (i > 0 ? i - 1 : photos.length - 1));
    resetZoom();
  }, [zoom, photos.length, resetZoom]);

  const next = useCallback(() => {
    if (zoom > 1) return;
    setIdx(i => (i < photos.length - 1 ? i + 1 : 0));
    resetZoom();
  }, [zoom, photos.length, resetZoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [prev, next, onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      panStart.current = { ...pan };
      pinchDist.current = 0;
    } else if (e.touches.length === 2) {
      pinchDist.current = getDistance(e.touches[0], e.touches[1]);
      pinchZoom.current = zoom;
      setDragging(false);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 2 && pinchDist.current > 0) {
      const dist = getDistance(e.touches[0], e.touches[1]);
      const scale = Math.min(5, Math.max(1, (dist / pinchDist.current) * pinchZoom.current));
      setZoom(scale);
      if (scale <= 1) setPan({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && zoom > 1) {
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;
      setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.changedTouches.length === 1) {
      const cx = e.changedTouches[0].clientX;
      const cy = e.changedTouches[0].clientY;
      const dx = cx - touchStartX.current;
      const dy = cy - touchStartY.current;

      const now = Date.now();
      const isDoubleTap =
        now - lastTap.current < 280 &&
        Math.abs(cx - lastTapPos.current.x) < 40 &&
        Math.abs(cy - lastTapPos.current.y) < 40;

      if (isDoubleTap) {
        if (zoom > 1) {
          resetZoom();
        } else {
          setZoom(2.5);
        }
        lastTap.current = 0;
        return;
      }

      lastTap.current = now;
      lastTapPos.current = { x: cx, y: cy };

      if (Math.abs(dx) > 60 && Math.abs(dy) < 80 && zoom <= 1) {
        if (dx < 0) next();
        else prev();
      } else if (zoom <= 1) {
        setPan({ x: 0, y: 0 });
      }
    }
    pinchDist.current = 0;
  };

  if (!photos.length) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.97)", touchAction: "none" }}
      data-testid="photo-viewer-overlay"
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}
        data-testid="button-close-photo-viewer"
      >
        <X className="w-5 h-5 text-white" />
      </button>

      {/* Photo count */}
      <div
        className="absolute top-5 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full text-xs font-bold text-white"
        style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}
        data-testid="text-photo-count"
      >
        {idx + 1} of {photos.length}
      </div>

      {/* Zoom hint */}
      {zoom > 1 && (
        <div
          className="absolute top-14 left-1/2 -translate-x-1/2 z-10 px-2.5 py-1 rounded-full text-[10px] font-bold"
          style={{ background: "rgba(0,229,118,0.15)", color: "#00e676", border: "1px solid rgba(0,229,118,0.25)" }}
        >
          {Math.round(zoom * 10) / 10}× · Double-tap to reset
        </div>
      )}

      {/* Main image touch area */}
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ cursor: zoom > 1 ? "grab" : "default" }}
      >
        <img
          src={photos[idx]}
          alt={`Photo ${idx + 1} of ${photos.length}`}
          draggable={false}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: dragging ? "none" : "transform 0.15s ease",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          data-testid={`img-viewer-photo-${idx}`}
        />
      </div>

      {/* Nav arrows (desktop) */}
      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center sm:flex hidden"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
            data-testid="button-photo-prev"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center sm:flex hidden"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
            data-testid="button-photo-next"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {photos.length > 1 && photos.length <= 15 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setIdx(i); resetZoom(); }}
              className="rounded-full transition-all"
              style={{
                width: i === idx ? 20 : 6,
                height: 6,
                background: i === idx ? "#00e676" : "rgba(255,255,255,0.3)",
              }}
              data-testid={`button-photo-dot-${i}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
