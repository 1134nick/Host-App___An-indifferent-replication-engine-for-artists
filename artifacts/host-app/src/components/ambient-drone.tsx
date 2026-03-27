import { useEffect, useRef, useState, useCallback } from "react";
import { createDroneOscillator } from "../lib/audio-engine";

export default function AmbientDrone({
  messageCount,
  active,
}: {
  messageCount: number;
  active: boolean;
}) {
  const droneRef = useRef<ReturnType<typeof createDroneOscillator> | null>(null);
  const [droneOn, setDroneOn] = useState(false);
  const pulseRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const startDrone = useCallback(() => {
    if (droneRef.current) return;
    droneRef.current = createDroneOscillator(messageCount);
    setDroneOn(true);
  }, [messageCount]);

  const stopDrone = useCallback(() => {
    droneRef.current?.stop();
    droneRef.current = null;
    setDroneOn(false);
  }, []);

  useEffect(() => {
    if (droneRef.current) {
      droneRef.current.setIntensity(messageCount);
    }
  }, [messageCount]);

  useEffect(() => {
    if (!active && droneRef.current) {
      stopDrone();
    }
  }, [active, stopDrone]);

  useEffect(() => {
    return () => {
      droneRef.current?.stop();
      droneRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const intensity = Math.min(messageCount / 50, 1);
  const pulseSpeed = 4 - intensity * 2;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={droneOn ? stopDrone : startDrone}
        className={`flex items-center gap-1.5 px-3 py-1.5 border text-[10px] font-mono uppercase tracking-widest transition-all ${
          droneOn
            ? "border-[var(--depth-red)] text-[var(--depth-red)] bg-[rgba(190,40,40,0.05)]"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
        title={droneOn ? "Kill ambient" : "Activate ambient drone"}
      >
        <div
          ref={pulseRef}
          className="w-2 h-2 rounded-full"
          style={{
            background: droneOn ? "var(--depth-red)" : "#666",
            animation: droneOn ? `drone-pulse ${pulseSpeed}s ease-in-out infinite` : "none",
            boxShadow: droneOn ? "0 0 4px var(--depth-red)" : "none",
          }}
        />
        {droneOn ? "DRONE" : "AMBIENT"}
      </button>
      {droneOn && (
        <span
          className="text-[9px] font-mono tracking-widest"
          style={{ color: "var(--depth-red)", opacity: 0.5 }}
        >
          {messageCount} ECHOES
        </span>
      )}
    </div>
  );
}
