import { useEffect, useRef, useState } from 'react';

/**
 * Confronto prima/dopo accessibile con mouse e touchscreen.
 * Il valore resta locale al viewer e non viene persistito.
 */
export const BeforeAfterSlider = ({ before, after, enabled = true }) => {
  const [position, setPosition] = useState(50);
  const frameRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const stopDragging = () => { draggingRef.current = false; };
    window.addEventListener('pointerup', stopDragging);
    return () => window.removeEventListener('pointerup', stopDragging);
  }, []);

  const updatePosition = (event) => {
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const next = ((event.clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, next)));
  };

  if (!enabled) return before;

  return (
    <div
      ref={frameRef}
      className="relative h-full w-full overflow-hidden bg-white touch-none select-none"
      onPointerMove={(event) => draggingRef.current && updatePosition(event)}
      onPointerDown={(event) => { draggingRef.current = true; updatePosition(event); }}
      role="group"
      aria-label="Confronto prima e dopo"
    >
      <div className="absolute inset-0">{before}</div>
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        {after}
      </div>
      <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${position}%` }}>
        <div className="h-full w-px bg-[#E0B840] shadow-[0_0_10px_rgba(224,184,64,0.8)]" />
        <div className="pointer-events-auto absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-[#E0B840] bg-[#0D0D1A] text-xs font-bold text-[#E0B840] shadow-lg" aria-label="Sposta confronto prima e dopo">
          ↔
        </div>
      </div>
      <div className="pointer-events-none absolute left-3 top-3 z-20 rounded bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">Dopo</div>
      <div className="pointer-events-none absolute right-3 top-3 z-20 rounded bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">Prima</div>
    </div>
  );
};

export default BeforeAfterSlider;
