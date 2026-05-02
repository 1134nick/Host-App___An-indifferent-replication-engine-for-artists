import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  useGetRoomMessages,
  useSendMessage,
  useRequestUploadUrl,
  useAddMessageReaction,
  useRemoveMessageReaction,
  getGetRoomMessagesQueryKey,
  type Message,
  type MessageReaction,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { createCaptureRecorder, type CaptureRecorder } from "../lib/audio-engine";

type Provider = "spotify" | "youtube" | "soundcloud" | "unknown";

const REACTION_GLYPHS = ["✦", "✧", "❂", "☼", "▲", "◉", "✺", "⌬"];

function detectProvider(url: string): Provider {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    if (h.endsWith("spotify.com")) return "spotify";
    if (h === "youtu.be" || h.endsWith("youtube.com")) return "youtube";
    if (h.endsWith("soundcloud.com")) return "soundcloud";
  } catch {}
  return "unknown";
}

function buildEmbed(url: string): { src: string; provider: Provider } | null {
  const provider = detectProvider(url);
  try {
    const u = new URL(url);
    if (provider === "spotify") {
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => ["track", "album", "playlist", "episode"].includes(p));
      if (idx >= 0 && parts[idx + 1]) {
        return { src: `https://open.spotify.com/embed/${parts[idx]}/${parts[idx + 1]}`, provider };
      }
    }
    if (provider === "youtube") {
      let id: string | null = null;
      if (u.hostname === "youtu.be") id = u.pathname.slice(1);
      else if (u.pathname.startsWith("/watch")) id = u.searchParams.get("v");
      else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2];
      else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2];
      if (id) return { src: `https://www.youtube.com/embed/${id}`, provider };
    }
    if (provider === "soundcloud") {
      return {
        src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff00aa&inverse=true&hide_related=true&show_comments=false&show_user=true`,
        provider,
      };
    }
  } catch {}
  return null;
}

const PALETTES = [
  { a: "#ff007a", b: "#00e5ff", c: "#9d00ff" },
  { a: "#00ff9d", b: "#ff00d4", c: "#ffae00" },
  { a: "#1bff00", b: "#ff0033", c: "#0099ff" },
  { a: "#ff3d00", b: "#00ffd0", c: "#ff00ff" },
  { a: "#ffd000", b: "#00b3ff", c: "#ff0066" },
];

interface DashboardChatProps {
  roomId: number;
  myMaskedLabel: string | null;
}

type Composer = "idle" | "link" | "file" | "record";

interface PositionedMessage {
  message: Message;
  cx: number;
  cy: number;
  ageRatio: number;
}

export default function DashboardChat({ roomId, myMaskedLabel }: DashboardChatProps) {
  const messagesParams = useMemo(() => ({ limit: 40 }), []);
  const messagesQueryKey = useMemo(
    () => getGetRoomMessagesQueryKey(roomId, messagesParams),
    [roomId, messagesParams],
  );
  const { data: messages } = useGetRoomMessages(roomId, messagesParams, {
    query: { queryKey: messagesQueryKey, refetchInterval: 2500 },
  });
  const sendMessage = useSendMessage();
  const requestUploadUrl = useRequestUploadUrl();
  const addReaction = useAddMessageReaction();
  const removeReaction = useRemoveMessageReaction();
  const qc = useQueryClient();

  const [composer, setComposer] = useState<Composer>("idle");
  const [text, setText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [strobe, setStrobe] = useState(0);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [hue, setHue] = useState(0);
  const [fault, setFault] = useState(0);
  const lastStrobeRef = useRef(0);
  const [replyTargetId, setReplyTargetId] = useState<number | null>(null);
  const [reactionTargetId, setReactionTargetId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<CaptureRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const palette = PALETTES[paletteIdx];

  useEffect(() => {
    const id = setInterval(() => {
      setHue((h) => (h + 1) % 360);
    }, 220);
    return () => clearInterval(id);
  }, []);

  const lastIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const newest = messages[messages.length - 1];
    if (lastIdRef.current === null) {
      lastIdRef.current = newest.id;
      return;
    }
    if (newest.id !== lastIdRef.current) {
      lastIdRef.current = newest.id;
      setStrobe((s) => s + 1);
      if (Math.random() < 0.45) {
        setPaletteIdx((p) => (p + 1) % PALETTES.length);
      }
    }
  }, [messages]);

  const triggerStrobe = useCallback(() => {
    const now = performance.now();
    if (now - lastStrobeRef.current < 140) return;
    lastStrobeRef.current = now;
    setStrobe((s) => s + 1);
  }, []);

  const triggerFault = useCallback(() => setFault((f) => f + 1), []);

  const recentMessages = useMemo(() => {
    if (!messages) return [];
    return messages.slice(-12);
  }, [messages]);

  // Compute positions for each message so we can draw tether lines for replies
  const positionedMessages = useMemo<PositionedMessage[]>(() => {
    const total = recentMessages.length;
    return recentMessages.map((m, i) => {
      const ageRatio = (total - 1 - i) / Math.max(total - 1, 1);
      const angle = (i / Math.max(total, 1)) * Math.PI * 2 + (hue * Math.PI) / 180;
      const radius = 38 + ageRatio * 18;
      const cx = 50 + Math.cos(angle) * radius;
      const cy = 50 + Math.sin(angle) * (radius * 0.55);
      return { message: m, cx, cy, ageRatio };
    });
  }, [recentMessages, hue]);

  const positionById = useMemo(() => {
    const m = new Map<number, PositionedMessage>();
    for (const p of positionedMessages) m.set(p.message.id, p);
    return m;
  }, [positionedMessages]);

  // Reply target may exist outside the recent visible window — keep it valid only if visible
  const replyTargetMessage = useMemo(() => {
    if (replyTargetId == null) return null;
    return positionById.get(replyTargetId)?.message ?? null;
  }, [replyTargetId, positionById]);

  useEffect(() => {
    if (replyTargetId != null && !positionById.has(replyTargetId)) {
      setReplyTargetId(null);
    }
    if (reactionTargetId != null && !positionById.has(reactionTargetId)) {
      setReactionTargetId(null);
    }
  }, [replyTargetId, reactionTargetId, positionById]);

  const cleanupRecorder = useCallback(() => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    if (captureRef.current?.isRecording()) {
      captureRef.current.cancel();
    }
    captureRef.current = null;
  }, []);

  useEffect(() => () => cleanupRecorder(), [cleanupRecorder]);

  const sendText = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const isUrlOnly = /^https:\/\/\S+$/i.test(trimmed) && !/\s/.test(trimmed);
    const urlProvider = isUrlOnly ? detectProvider(trimmed) : "unknown";
    setBusy(true);
    triggerStrobe();
    try {
      if (isUrlOnly && urlProvider !== "unknown") {
        await sendMessage.mutateAsync({
          roomId,
          data: {
            content: null,
            mediaType: "link",
            mediaUrl: trimmed,
            parentMessageId: replyTargetId ?? null,
          },
        });
      } else {
        await sendMessage.mutateAsync({
          roomId,
          data: { content: text, parentMessageId: replyTargetId ?? null },
        });
      }
      setText("");
      setComposer("idle");
      setReplyTargetId(null);
      qc.invalidateQueries({ queryKey: messagesQueryKey });
    } catch {
      triggerFault();
    } finally {
      setBusy(false);
    }
  }, [text, busy, sendMessage, roomId, qc, messagesQueryKey, triggerStrobe, triggerFault, replyTargetId]);

  const sendLink = useCallback(async () => {
    const url = linkUrl.trim();
    if (!url || busy) return;
    const provider = detectProvider(url);
    if (provider === "unknown" || !/^https:\/\//i.test(url)) {
      triggerFault();
      return;
    }
    setBusy(true);
    triggerStrobe();
    try {
      await sendMessage.mutateAsync({
        roomId,
        data: {
          content: text.trim() || null,
          mediaType: "link",
          mediaUrl: url,
          parentMessageId: replyTargetId ?? null,
        },
      });
      setLinkUrl("");
      setText("");
      setComposer("idle");
      setReplyTargetId(null);
      qc.invalidateQueries({ queryKey: messagesQueryKey });
    } catch {
      triggerFault();
    } finally {
      setBusy(false);
    }
  }, [linkUrl, text, busy, sendMessage, roomId, qc, messagesQueryKey, triggerStrobe, triggerFault, replyTargetId]);

  const uploadAndSend = useCallback(
    async (
      blob: Blob,
      mime: string,
      ext: string,
      opts: { isCapture: boolean; durationMs?: number },
    ) => {
      setBusy(true);
      triggerStrobe();
      try {
        const urlData = await requestUploadUrl.mutateAsync({
          data: { name: `share.${ext}`, size: blob.size, contentType: mime },
        });
        const up = await fetch(urlData.uploadURL, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": mime },
        });
        if (!up.ok) throw new Error("upload failed");
        await sendMessage.mutateAsync({
          roomId,
          data: {
            content: text.trim() || null,
            mediaType: "audio",
            mediaUrl: urlData.objectPath,
            mediaMimeType: mime,
            mediaDurationMs: opts.durationMs,
            isCapture: opts.isCapture,
            parentMessageId: replyTargetId ?? null,
          },
        });
        setText("");
        setComposer("idle");
        setReplyTargetId(null);
        qc.invalidateQueries({ queryKey: messagesQueryKey });
      } catch {
        triggerFault();
      } finally {
        setBusy(false);
      }
    },
    [requestUploadUrl, sendMessage, roomId, text, qc, messagesQueryKey, triggerStrobe, triggerFault, replyTargetId],
  );

  const handleFile = useCallback(
    async (file: File) => {
      const lowerName = file.name.toLowerCase();
      const isMp3 = file.type === "audio/mpeg" || lowerName.endsWith(".mp3");
      const isWav =
        file.type === "audio/wav" ||
        file.type === "audio/x-wav" ||
        file.type === "audio/wave" ||
        lowerName.endsWith(".wav");
      if (!isMp3 && !isWav) {
        triggerFault();
        return;
      }
      const mime = isMp3 ? "audio/mpeg" : "audio/wav";
      const ext = isMp3 ? "mp3" : "wav";
      await uploadAndSend(file, mime, ext, { isCapture: false });
    },
    [uploadAndSend, triggerFault],
  );

  const startRecording = useCallback(async () => {
    setComposer("record");
    triggerStrobe();
    try {
      const cap = await createCaptureRecorder({ distortionAmount: 6 });
      captureRef.current = cap;
      cap.start();
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs((s) => s + 1), 1000);
    } catch {
      cleanupRecorder();
      setComposer("idle");
      triggerFault();
    }
  }, [triggerStrobe, cleanupRecorder, triggerFault]);

  const stopRecording = useCallback(async () => {
    const cap = captureRef.current;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    if (!cap || !cap.isRecording()) {
      setRecording(false);
      return;
    }
    try {
      const { blob, mimeType, durationMs } = await cap.stop();
      captureRef.current = null;
      setRecording(false);
      if (blob.size === 0) {
        setComposer("idle");
        return;
      }
      const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
      await uploadAndSend(blob, mimeType, ext, { isCapture: true, durationMs });
    } catch {
      cleanupRecorder();
      setRecording(false);
      setComposer("idle");
      triggerFault();
    }
  }, [uploadAndSend, cleanupRecorder, triggerFault]);

  const cancelRecording = useCallback(() => {
    cleanupRecorder();
    setRecording(false);
    setComposer("idle");
  }, [cleanupRecorder]);

  const handleToggleReaction = useCallback(
    async (messageId: number, glyph: string, alreadyMine: boolean) => {
      triggerStrobe();
      try {
        if (alreadyMine) {
          await removeReaction.mutateAsync({ roomId, messageId, glyph: encodeURIComponent(glyph) });
        } else {
          await addReaction.mutateAsync({ roomId, messageId, data: { glyph } });
        }
        qc.invalidateQueries({ queryKey: messagesQueryKey });
      } catch {
        triggerFault();
      }
    },
    [addReaction, removeReaction, roomId, qc, messagesQueryKey, triggerStrobe, triggerFault],
  );

  const flashKey = strobe;

  // Build SVG reply tether lines from each reply node back to its parent
  const replyTethers = useMemo(() => {
    const lines: Array<{ id: number; x1: number; y1: number; x2: number; y2: number }> = [];
    for (const child of positionedMessages) {
      const parentId = child.message.parentMessageId;
      if (parentId == null) continue;
      const parent = positionById.get(parentId);
      if (!parent) continue;
      lines.push({
        id: child.message.id,
        x1: child.cx,
        y1: child.cy,
        x2: parent.cx,
        y2: parent.cy,
      });
    }
    return lines;
  }, [positionedMessages, positionById]);

  return (
    <div
      className="dchat-root relative w-full overflow-hidden"
      style={{
        height: 620,
        background: `radial-gradient(ellipse at 50% 60%, hsl(${(hue + 240) % 360} 100% 6%) 0%, #000 70%)`,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: `inset 0 0 120px hsl(${hue} 100% 30% / 0.35)`,
      }}
      onMouseMove={triggerStrobe}
    >
      <div className="dchat-scanlines pointer-events-none absolute inset-0" />
      <div className="dchat-noise pointer-events-none absolute inset-0" />

      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 1000 620"
        preserveAspectRatio="none"
      >
        <defs>
          <radialGradient id="dchat-pinch" cx="50%" cy="55%" r="55%">
            <stop offset="0%" stopColor={palette.a} stopOpacity="0.95" />
            <stop offset="35%" stopColor={palette.c} stopOpacity="0.55" />
            <stop offset="75%" stopColor={palette.b} stopOpacity="0.18" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="dchat-wedge-a" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={palette.b} stopOpacity="0" />
            <stop offset="60%" stopColor={palette.a} stopOpacity="0.55" />
            <stop offset="100%" stopColor={palette.c} stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="dchat-wedge-b" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={palette.c} stopOpacity="0" />
            <stop offset="60%" stopColor={palette.b} stopOpacity="0.55" />
            <stop offset="100%" stopColor={palette.a} stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="dchat-wedge-c" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={palette.a} stopOpacity="0" />
            <stop offset="100%" stopColor={palette.b} stopOpacity="0.85" />
          </linearGradient>
          <filter id="dchat-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="dchat-warp">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="3">
              <animate attributeName="baseFrequency" dur="22s" values="0.008;0.018;0.008" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale="38" />
          </filter>
        </defs>

        <g style={{ transformOrigin: "500px 340px", transform: `rotate(${(hue / 6).toFixed(1)}deg)` }} filter="url(#dchat-warp)">
          <polygon points="0,0 1000,0 500,340" fill="url(#dchat-wedge-a)" opacity="0.55" />
          <polygon points="1000,0 1000,620 500,340" fill="url(#dchat-wedge-b)" opacity="0.55" />
          <polygon points="0,620 1000,620 500,340" fill="url(#dchat-wedge-c)" opacity="0.55" />
          <polygon points="0,0 0,620 500,340" fill="url(#dchat-wedge-a)" opacity="0.55" />
        </g>

        <circle cx="500" cy="340" r="220" fill="url(#dchat-pinch)" filter="url(#dchat-blur)" />
        <circle cx="500" cy="340" r="60" fill={palette.a} opacity="0.25" filter="url(#dchat-blur)" />
        <circle cx="500" cy="340" r="14" fill="#fff" opacity="0.85">
          <animate attributeName="r" values="10;18;10" dur="3.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.55;1;0.55" dur="3.5s" repeatCount="indefinite" />
        </circle>
      </svg>

      {/* Reply tether overlay (percent-based positioning matches message nodes) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-[12]"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {replyTethers.map((t) => (
          <g key={`tether-${t.id}`}>
            <line
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={palette.b}
              strokeWidth="0.35"
              strokeDasharray="0.8 0.6"
              opacity="0.85"
              vectorEffect="non-scaling-stroke"
              style={{
                filter: `drop-shadow(0 0 4px ${palette.b}) drop-shadow(0 0 8px ${palette.a})`,
              }}
            >
              <animate
                attributeName="stroke-dashoffset"
                values="0;-1.4"
                dur="1.6s"
                repeatCount="indefinite"
              />
            </line>
          </g>
        ))}
      </svg>

      <AnimatePresence>
        <motion.div
          key={flashKey}
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 55%, ${palette.a} 0%, transparent 60%)`,
            mixBlendMode: "screen",
          }}
        />
      </AnimatePresence>

      <AnimatePresence>
        <motion.div
          key={`fault-${fault}`}
          initial={{ opacity: fault === 0 ? 0 : 0.7 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(0deg, rgba(255,0,40,0.35) 0px, rgba(255,0,40,0.35) 2px, transparent 2px, transparent 6px)",
            mixBlendMode: "screen",
          }}
        />
      </AnimatePresence>

      <div className="absolute top-3 right-4 z-20 font-mono text-[10px] tracking-[0.3em] uppercase select-none"
        style={{ color: palette.a, textShadow: `0 0 8px ${palette.a}, 0 0 18px ${palette.b}` }}>
        {myMaskedLabel || "—"}
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none">
        <AnimatePresence>
          {positionedMessages.map(({ message: m, cx, cy, ageRatio }) => {
            const isOwn = m.maskedSenderLabel === myMaskedLabel;
            const fragmenting = ageRatio > 0.55;
            const isReplyTarget = m.id === replyTargetId;
            const isReactionTarget = m.id === reactionTargetId;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, scale: 0.6, filter: "blur(12px)" }}
                animate={{
                  opacity: 1 - ageRatio * 0.55,
                  scale: 1 - ageRatio * 0.25,
                  filter: fragmenting ? `blur(${ageRatio * 4}px)` : "blur(0px)",
                }}
                exit={{ opacity: 0, scale: 0.4, filter: "blur(20px)" }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="absolute pointer-events-auto"
                style={{
                  left: `${cx}%`,
                  top: `${cy}%`,
                  transform: "translate(-50%, -50%)",
                  maxWidth: 280,
                  zIndex: isReactionTarget || isReplyTarget ? 25 : 15,
                }}
              >
                <MessageNode
                  message={m}
                  isOwn={isOwn}
                  palette={palette}
                  hue={hue}
                  ageRatio={ageRatio}
                  isReplyTarget={isReplyTarget}
                  isReactionTarget={isReactionTarget}
                  onToggleReactionPanel={() => {
                    triggerStrobe();
                    setReactionTargetId((cur) => (cur === m.id ? null : m.id));
                  }}
                  onToggleReplyTarget={() => {
                    triggerStrobe();
                    setReplyTargetId((cur) => (cur === m.id ? null : m.id));
                    setComposer("idle");
                  }}
                  onPickGlyph={(glyph) => {
                    const mine = (m.reactions ?? []).some(
                      (r) => r.glyph === glyph && r.mine,
                    );
                    handleToggleReaction(m.id, glyph, mine);
                    setReactionTargetId(null);
                  }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="absolute left-0 right-0 bottom-4 z-30 flex flex-col items-center gap-2 pointer-events-none">
        {replyTargetMessage && (
          <div
            className="pointer-events-auto px-3 py-1 font-mono text-[10px] uppercase tracking-[0.25em] flex items-center gap-3"
            style={{
              color: palette.b,
              background: "rgba(0,0,0,0.65)",
              border: `1px solid ${palette.b}`,
              borderRadius: 999,
              boxShadow: `0 0 10px ${palette.b}66`,
              maxWidth: 480,
            }}
          >
            <span style={{ color: palette.a }}>↪ tether</span>
            <span className="truncate" style={{ maxWidth: 320, color: "#f5f0e8" }}>
              {(replyTargetMessage.maskedSenderLabel || "—").replace(/-/g, "·")}
              {replyTargetMessage.content ? ` :: ${replyTargetMessage.content}` : ""}
            </span>
            <button
              type="button"
              onClick={() => setReplyTargetId(null)}
              className="ml-1"
              style={{ color: palette.b, background: "transparent", border: "none", cursor: "pointer" }}
              aria-label="cancel reply"
            >
              ×
            </button>
          </div>
        )}
        <div className="pointer-events-auto flex items-end gap-3">
          <ComposerNode
            active={composer === "file"}
            palette={palette}
            onClick={() => {
              triggerStrobe();
              setComposer("file");
              fileInputRef.current?.click();
            }}
            shape="blob1"
            glyph="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
          />
          <ComposerNode
            active={composer === "link"}
            palette={palette}
            onClick={() => {
              triggerStrobe();
              setComposer((c) => (c === "link" ? "idle" : "link"));
            }}
            shape="blob2"
            glyph="M10 13a5 5 0 007.07 0l3-3a5 5 0 10-7.07-7.07l-1.5 1.5M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 107.07 7.07l1.5-1.5"
          />
          <CenterField
            text={text}
            setText={setText}
            onSendText={sendText}
            disabled={busy}
            palette={palette}
            myLabel={myMaskedLabel}
            composer={composer}
            linkUrl={linkUrl}
            setLinkUrl={setLinkUrl}
            onSendLink={sendLink}
            recording={recording}
            recordSecs={recordSecs}
            onStopRecording={stopRecording}
            onCancelRecording={cancelRecording}
            replyActive={replyTargetMessage !== null}
          />
          <ComposerNode
            active={composer === "record"}
            palette={palette}
            onClick={() => {
              triggerStrobe();
              if (composer === "record" && recording) {
                stopRecording();
              } else if (composer === "record") {
                cancelRecording();
              } else {
                startRecording();
              }
            }}
            shape="blob3"
            glyph="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3"
            pulsing={recording}
          />
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      <style>{`
        .dchat-scanlines {
          background: repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,0.04) 0px,
            rgba(255,255,255,0.04) 1px,
            transparent 1px,
            transparent 3px
          );
          mix-blend-mode: overlay;
          opacity: 0.45;
        }
        .dchat-noise {
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/></svg>");
          mix-blend-mode: overlay;
          opacity: 0.18;
          animation: dchat-noise 0.18s steps(2) infinite;
        }
        @keyframes dchat-noise {
          0%   { transform: translate(0,0); }
          50%  { transform: translate(-3px,2px); }
          100% { transform: translate(2px,-1px); }
        }
        @keyframes dchat-pulse {
          0%,100% { transform: scale(1); }
          50%     { transform: scale(1.08); }
        }
        .dchat-pulse { animation: dchat-pulse 0.85s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function ComposerNode({
  active,
  palette,
  onClick,
  shape,
  glyph,
  pulsing,
}: {
  active: boolean;
  palette: { a: string; b: string; c: string };
  onClick: () => void;
  shape: "blob1" | "blob2" | "blob3";
  glyph: string;
  pulsing?: boolean;
}) {
  const blobPaths: Record<string, string> = {
    blob1: "M30,5 C50,2 70,12 78,30 C86,48 80,72 60,78 C40,84 14,76 8,56 C2,36 10,8 30,5 Z",
    blob2: "M40,4 C66,4 84,22 82,46 C80,70 60,84 36,82 C12,80 0,58 6,34 C12,10 22,4 40,4 Z",
    blob3: "M44,6 C70,10 88,32 80,56 C72,80 44,86 22,76 C0,66 -2,38 14,18 C24,6 32,4 44,6 Z",
  };
  return (
    <button
      onClick={onClick}
      className={`relative ${pulsing ? "dchat-pulse" : ""}`}
      style={{
        width: 64,
        height: 64,
        background: "transparent",
        border: "none",
        cursor: "pointer",
      }}
    >
      <svg viewBox="0 0 88 88" width="64" height="64">
        <defs>
          <radialGradient id={`grad-${shape}`} cx="40%" cy="40%" r="80%">
            <stop offset="0%" stopColor={palette.a} stopOpacity={active ? 1 : 0.85} />
            <stop offset="60%" stopColor={palette.c} stopOpacity={active ? 0.9 : 0.55} />
            <stop offset="100%" stopColor={palette.b} stopOpacity={active ? 1 : 0.4} />
          </radialGradient>
        </defs>
        <path
          d={blobPaths[shape]}
          fill={`url(#grad-${shape})`}
          stroke={active ? "#fff" : palette.a}
          strokeWidth={active ? 2 : 1}
          style={{
            filter: active
              ? `drop-shadow(0 0 14px ${palette.a}) drop-shadow(0 0 28px ${palette.b})`
              : `drop-shadow(0 0 6px ${palette.c})`,
            transition: "filter 250ms",
          }}
        />
        <path
          d={glyph}
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(26 26) scale(1.5)"
          style={{ mixBlendMode: "screen" }}
        />
      </svg>
    </button>
  );
}

function CenterField({
  text,
  setText,
  onSendText,
  disabled,
  palette,
  composer,
  linkUrl,
  setLinkUrl,
  onSendLink,
  recording,
  recordSecs,
  onStopRecording,
  onCancelRecording,
  replyActive,
}: {
  text: string;
  setText: (v: string) => void;
  onSendText: () => void;
  disabled: boolean;
  palette: { a: string; b: string; c: string };
  myLabel: string | null;
  composer: Composer;
  linkUrl: string;
  setLinkUrl: (v: string) => void;
  onSendLink: () => void;
  recording: boolean;
  recordSecs: number;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  replyActive: boolean;
}) {
  return (
    <div
      className="relative px-2 py-1 flex items-center"
      style={{
        minWidth: 360,
        maxWidth: 480,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        border: `1px solid ${replyActive ? palette.b : palette.a}`,
        boxShadow: replyActive
          ? `0 0 22px ${palette.b}aa, inset 0 0 14px ${palette.b}66`
          : `0 0 18px ${palette.b}66, inset 0 0 12px ${palette.c}44`,
        borderRadius: 999,
      }}
    >
      {composer === "record" ? (
        <div className="flex-1 flex items-center gap-3 px-3 py-2 font-mono text-xs">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: recording ? palette.a : "#666", boxShadow: recording ? `0 0 10px ${palette.a}` : "none", animation: recording ? "dchat-pulse 0.8s infinite" : "none" }}
          />
          <span className="flex-1" style={{ color: palette.a }}>
            {recording ? `${recordSecs.toString().padStart(2, "0")}s` : "··"}
          </span>
          <button
            onClick={recording ? onStopRecording : onCancelRecording}
            className="text-[10px] uppercase tracking-widest px-3 py-1"
            style={{ color: palette.b, border: `1px solid ${palette.b}`, borderRadius: 999, background: "transparent" }}
          >
            {recording ? "↯" : "×"}
          </button>
        </div>
      ) : composer === "link" ? (
        <input
          type="url"
          autoFocus
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSendLink();
            }
          }}
          disabled={disabled}
          placeholder=""
          className="flex-1 bg-transparent border-none outline-none px-4 py-2 font-mono text-sm"
          style={{ color: palette.a, caretColor: palette.a }}
        />
      ) : (
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSendText();
            }
          }}
          disabled={disabled}
          placeholder=""
          className="flex-1 bg-transparent border-none outline-none px-4 py-2 font-mono text-sm"
          style={{ color: "#f5f0e8", caretColor: palette.a }}
        />
      )}
    </div>
  );
}

interface AggregatedReaction {
  glyph: string;
  count: number;
  mine: boolean;
}

function aggregateReactions(reactions: MessageReaction[] | undefined): AggregatedReaction[] {
  if (!reactions || reactions.length === 0) return [];
  const map = new Map<string, AggregatedReaction>();
  for (const r of reactions) {
    const cur = map.get(r.glyph);
    if (cur) {
      cur.count += 1;
      if (r.mine) cur.mine = true;
    } else {
      map.set(r.glyph, { glyph: r.glyph, count: 1, mine: r.mine });
    }
  }
  return Array.from(map.values());
}

function MessageNode({
  message,
  isOwn,
  palette,
  hue,
  ageRatio,
  isReplyTarget,
  isReactionTarget,
  onToggleReactionPanel,
  onToggleReplyTarget,
  onPickGlyph,
}: {
  message: Message;
  isOwn: boolean;
  palette: { a: string; b: string; c: string };
  hue: number;
  ageRatio: number;
  isReplyTarget: boolean;
  isReactionTarget: boolean;
  onToggleReactionPanel: () => void;
  onToggleReplyTarget: () => void;
  onPickGlyph: (glyph: string) => void;
}) {
  const tint = isOwn ? palette.a : palette.b;
  const inner = isOwn ? palette.c : palette.a;
  const embed = message.mediaType === "link" && message.mediaUrl ? buildEmbed(message.mediaUrl) : null;
  const isAudio = message.mediaType === "audio" && message.mediaUrl;
  const aggregated = aggregateReactions(message.reactions);
  const isReply = message.parentMessageId != null;

  return (
    <div className="relative pointer-events-auto">
      <div
        className="font-mono text-[11px] leading-snug rounded-2xl px-3 py-2 backdrop-blur"
        style={{
          background: `linear-gradient(135deg, ${tint}26 0%, ${inner}33 100%)`,
          border: isReplyTarget
            ? `1px solid #fff`
            : isReply
              ? `1px dashed ${palette.b}aa`
              : `1px solid ${tint}88`,
          boxShadow: isReplyTarget
            ? `0 0 18px ${palette.a}, 0 0 32px ${palette.b}, inset 0 0 10px #fff8`
            : `0 0 12px ${tint}66, inset 0 0 8px ${inner}55`,
          color: "#f5f0e8",
          minWidth: 120,
          textShadow: `0 0 4px ${inner}aa`,
          transition: "all 250ms",
          opacity: 1 - ageRatio * 0.15,
        }}
      >
        <div className="flex items-center gap-2 mb-1 opacity-80">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: tint, boxShadow: `0 0 6px ${tint}` }}
          />
          <span style={{ color: tint, letterSpacing: "0.15em" }}>
            {(message.maskedSenderLabel || "—").replace(/-/g, "·")}
          </span>
          {isReply && (
            <span
              title="reply"
              style={{
                color: palette.b,
                fontSize: 10,
                letterSpacing: "0.2em",
                textShadow: `0 0 4px ${palette.b}`,
              }}
            >
              ↪
            </span>
          )}
        </div>
        {message.content && <div className="break-words">{message.content}</div>}
        {isAudio && (
          <audio
            controls
            src={`/api/storage${message.mediaUrl}`}
            className="mt-1 w-full"
            style={{
              height: 28,
              filter: `hue-rotate(${hue.toFixed(0)}deg) saturate(1.6)`,
            }}
          />
        )}
        {embed && (
          <div className="mt-1 overflow-hidden rounded" style={{ width: 240 }}>
            <iframe
              src={embed.src}
              width="240"
              height={embed.provider === "youtube" ? 135 : embed.provider === "spotify" ? 80 : 120}
              allow="autoplay; encrypted-media; fullscreen"
              style={{ border: 0, display: "block" }}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            />
          </div>
        )}
        {message.mediaType === "link" && !embed && message.mediaUrl && (
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-1 underline truncate"
            style={{ color: inner }}
          >
            {message.mediaUrl}
          </a>
        )}

        {/* Action row: react + reply */}
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleReactionPanel();
            }}
            className="font-mono text-[10px] tracking-widest px-2 py-[2px]"
            style={{
              color: isReactionTarget ? "#000" : palette.a,
              background: isReactionTarget ? palette.a : "transparent",
              border: `1px solid ${palette.a}`,
              borderRadius: 999,
              cursor: "pointer",
            }}
            aria-label="react"
          >
            ✦+
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleReplyTarget();
            }}
            className="font-mono text-[10px] tracking-widest px-2 py-[2px]"
            style={{
              color: isReplyTarget ? "#000" : palette.b,
              background: isReplyTarget ? palette.b : "transparent",
              border: `1px solid ${palette.b}`,
              borderRadius: 999,
              cursor: "pointer",
            }}
            aria-label="reply"
          >
            ↪
          </button>
        </div>
      </div>

      {/* Orbiting reaction micro-nodes */}
      {aggregated.length > 0 && (
        <ReactionOrbit
          reactions={aggregated}
          palette={palette}
        />
      )}

      {/* Reaction picker panel */}
      {isReactionTarget && (
        <div
          className="absolute z-40 flex flex-wrap gap-1 px-2 py-1"
          style={{
            top: -42,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.85)",
            border: `1px solid ${palette.a}`,
            borderRadius: 999,
            boxShadow: `0 0 14px ${palette.a}, 0 0 28px ${palette.b}66`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {REACTION_GLYPHS.map((g) => {
            const mine = (message.reactions ?? []).some((r) => r.glyph === g && r.mine);
            return (
              <button
                key={g}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPickGlyph(g);
                }}
                className="font-mono text-sm leading-none px-1.5 py-1"
                style={{
                  color: mine ? "#000" : palette.a,
                  background: mine ? palette.a : "transparent",
                  border: "none",
                  cursor: "pointer",
                  textShadow: mine ? "none" : `0 0 6px ${palette.a}`,
                  borderRadius: 999,
                }}
                aria-label={`react ${g}`}
                aria-pressed={mine}
              >
                {g}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReactionOrbit({
  reactions,
  palette,
}: {
  reactions: AggregatedReaction[];
  palette: { a: string; b: string; c: string };
}) {
  const radius = 38;
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top: "50%",
        left: "50%",
        width: 0,
        height: 0,
      }}
    >
      {reactions.map((r, i) => {
        const total = reactions.length;
        const angle = (i / Math.max(total, 1)) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * 0.55;
        const tint = r.mine ? palette.a : palette.c;
        return (
          <div
            key={r.glyph}
            className="absolute font-mono"
            style={{
              left: x,
              top: y,
              transform: "translate(-50%, -50%)",
              fontSize: 12,
              color: tint,
              textShadow: `0 0 6px ${tint}, 0 0 12px ${palette.b}`,
              animation: `dchat-pulse ${1.4 + (i % 3) * 0.3}s ease-in-out infinite`,
              whiteSpace: "nowrap",
            }}
          >
            <span>{r.glyph}</span>
            {r.count > 1 && (
              <span
                className="ml-0.5"
                style={{
                  fontSize: 9,
                  color: palette.b,
                  textShadow: `0 0 4px ${palette.b}`,
                }}
              >
                ×{r.count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
