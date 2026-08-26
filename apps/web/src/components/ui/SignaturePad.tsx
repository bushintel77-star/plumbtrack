"use client";

import { useRef, useState } from "react";
import type { PointerEvent } from "react";

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  confirmLabel: string;
}

/**
 * Industrial-grade signature pad: bright ink on a dark canvas,
 * with correct CSS-to-buffer coordinate scaling.
 */
export function SignaturePad({ onSave, confirmLabel }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  function getPos(event: PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = getPos(event, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(event, canvas);
    ctx.lineTo(x, y);
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--signature-ink").trim();
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasDrawn(true);
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    onSave(canvas.toDataURL("image/png"));
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={560}
        height={160}
        className="w-full rounded-xl touch-none surface-inset signature-pad"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={clear}
          className="flex-1 py-3 rounded-xl bg-fill text-ink-mid text-sm font-medium active:bg-fill-strong transition border border-line min-h-[48px]"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!hasDrawn}
          className="flex-1 py-3 rounded-xl bg-accent text-on-accent text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed active:brightness-110 transition min-h-[48px] shadow-hardware"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
