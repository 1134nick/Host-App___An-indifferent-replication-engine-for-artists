import { useRef, useEffect, useCallback } from "react";
import { getAnalyserData } from "../lib/audio-engine";

export default function Waveform({
  analyser,
  playing,
  width = 220,
  height = 32,
}: {
  analyser: AnalyserNode | null;
  playing: boolean;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const glitchOffset = useRef(0);
  const frameCount = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { waveform, frequency } = getAnalyserData(analyser);
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    frameCount.current++;
    if (frameCount.current % 7 === 0) {
      glitchOffset.current = (Math.random() - 0.5) * 4;
    }
    if (frameCount.current % 30 === 0) {
      glitchOffset.current = 0;
    }

    const barCount = frequency.length;
    const barWidth = w / barCount;

    ctx.fillStyle = "rgba(40, 80, 180, 0.15)";
    for (let i = 0; i < barCount; i++) {
      const barHeight = (frequency[i] / 255) * h * 0.6;
      const x = i * barWidth;
      ctx.fillRect(x, h - barHeight, barWidth - 1, barHeight);
    }

    ctx.beginPath();
    ctx.strokeStyle = "rgba(40, 80, 180, 0.85)";
    ctx.lineWidth = 1.5;

    const sliceWidth = w / waveform.length;
    let x = 0;
    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i] / 128.0;
      const y = (v * h) / 2 + glitchOffset.current;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "rgba(190, 40, 40, 0.45)";
    ctx.lineWidth = 1;
    x = 0;
    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i] / 128.0;
      const y = (v * h) / 2 + 1.5 + glitchOffset.current * 0.7;
      if (i === 0) ctx.moveTo(x + 2, y);
      else ctx.lineTo(x + 2, y);
      x += sliceWidth;
    }
    ctx.stroke();

    if (frameCount.current % 60 < 3) {
      const sliceY = Math.random() * h;
      const sliceH = 2 + Math.random() * 4;
      const imgData = ctx.getImageData(0, sliceY, w, sliceH);
      ctx.putImageData(imgData, (Math.random() - 0.5) * 6, sliceY);
    }

    if (playing) {
      rafRef.current = requestAnimationFrame(draw);
    }
  }, [analyser, playing]);

  useEffect(() => {
    if (playing && analyser) {
      rafRef.current = requestAnimationFrame(draw);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, analyser, draw]);

  useEffect(() => {
    if (!playing) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.beginPath();
          ctx.strokeStyle = "rgba(40, 80, 180, 0.2)";
          ctx.lineWidth = 0.5;
          ctx.moveTo(0, canvas.height / 2);
          ctx.lineTo(canvas.width, canvas.height / 2);
          ctx.stroke();
        }
      }
    }
  }, [playing]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full"
      style={{ height: `${height}px`, imageRendering: "pixelated" }}
    />
  );
}
