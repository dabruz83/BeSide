import { useEffect, useRef, useState } from 'react';

const pointFromEvent = (event, canvas) => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
};

/** Manual polygon mask: transparent inside the polygon, opaque outside. */
export const PhotoMaskEditor = ({ imageUrl, onMaskChange }) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [points, setPoints] = useState([]);
  const [dimensions, setDimensions] = useState(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      setPoints([]);
      onMaskChange?.(null, []);
    };
    image.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !dimensions) return;
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (points.length) {
      context.beginPath();
      points.forEach((point, index) => {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        index ? context.lineTo(x, y) : context.moveTo(x, y);
      });
      context.closePath();
      context.fillStyle = 'rgba(224, 184, 64, 0.28)';
      context.fill();
      context.strokeStyle = '#E0B840';
      context.lineWidth = Math.max(3, canvas.width / 500);
      context.stroke();
      points.forEach((point) => {
        context.beginPath();
        context.arc(point.x * canvas.width, point.y * canvas.height, Math.max(5, canvas.width / 180), 0, Math.PI * 2);
        context.fillStyle = '#E0B840';
        context.fill();
      });
    }
  }, [points, dimensions]);

  const addPoint = (event) => {
    event.preventDefault();
    if (!canvasRef.current) return;
    setPoints((current) => [...current, pointFromEvent(event, canvasRef.current)]);
  };

  const generateMask = () => {
    if (!dimensions || points.length < 3) return;
    const mask = document.createElement('canvas');
    mask.width = dimensions.width;
    mask.height = dimensions.height;
    const context = mask.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, mask.width, mask.height);
    context.globalCompositeOperation = 'destination-out';
    context.beginPath();
    points.forEach((point, index) => {
      const x = point.x * mask.width;
      const y = point.y * mask.height;
      index ? context.lineTo(x, y) : context.moveTo(x, y);
    });
    context.closePath();
    context.fill();
    mask.toBlob((blob) => {
      if (blob) onMaskChange?.(new File([blob], 'vehicle-mask.png', { type: 'image/png' }), points);
    }, 'image/png');
  };

  const clear = () => {
    setPoints([]);
    onMaskChange?.(null, []);
  };

  return (
    <div className="rounded-xl border border-[#2A2A3E] bg-[#13131F] p-3">
      <p className="mb-2 text-xs font-semibold text-white">Seleziona manualmente la superficie</p>
      <p className="mb-2 text-[11px] text-[#999]">Disegna almeno 3 punti. L’area oro sarà trasparente nella maschera e quindi modificabile.</p>
      <div className="relative overflow-hidden rounded-lg bg-black">
        <img src={imageUrl} alt="Foto da delimitare" className="block h-auto w-full" />
        <canvas ref={canvasRef} onPointerDown={addPoint} className="absolute inset-0 h-full w-full touch-none cursor-crosshair" aria-label="Disegno poligono maschera" />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#AAA]">
        <span>{points.length} punti · dimensione originale preservata</span>
        <div className="flex gap-2">
          <button type="button" onClick={clear} className="rounded border border-[#555] px-2 py-1 hover:border-[#E0B840]">Cancella</button>
          <button type="button" disabled={points.length < 3} onClick={generateMask} className="rounded bg-[#E0B840] px-2 py-1 font-semibold text-[#0D0D1A] disabled:cursor-not-allowed disabled:opacity-40">Genera maschera PNG</button>
        </div>
      </div>
    </div>
  );
};

export default PhotoMaskEditor;
