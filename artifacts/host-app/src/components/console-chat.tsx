import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  useGetRoomMessages,
  useSendMessage,
  useRequestUploadUrl,
  useGetMe,
  getGetRoomMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, Square, Upload, Link2, Send, X } from "lucide-react";

type LinkEmbed =
  | { provider: "spotify"; embedUrl: string; url: string }
  | { provider: "youtube"; embedUrl: string; url: string }
  | { provider: "soundcloud"; embedUrl: string; url: string }
  | { provider: "bandcamp"; url: string; host: string }
  | { provider: "generic"; host: string; url: string };

const URL_RE = /(https?:\/\/[^\s]+)/i;

function parseEmbed(rawUrl: string): LinkEmbed | null {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  if (host === "open.spotify.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return { provider: "spotify", url: rawUrl, embedUrl: `https://open.spotify.com/embed/${parts[0]}/${parts[1]}` };
    }
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = u.searchParams.get("v");
    if (v) return { provider: "youtube", url: rawUrl, embedUrl: `https://www.youtube.com/embed/${v}` };
  }
  if (host === "youtu.be") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    if (id) return { provider: "youtube", url: rawUrl, embedUrl: `https://www.youtube.com/embed/${id}` };
  }
  if (host === "soundcloud.com" || host.endsWith(".soundcloud.com")) {
    return {
      provider: "soundcloud",
      url: rawUrl,
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(rawUrl)}&color=%232850b4&auto_play=false&hide_related=true&visual=false`,
    };
  }
  if (host === "bandcamp.com" || host.endsWith(".bandcamp.com")) {
    return { provider: "bandcamp", url: rawUrl, host };
  }
  return { provider: "generic", url: rawUrl, host };
}

function findFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(URL_RE);
  return m ? m[0].replace(/[),.;]+$/, "") : null;
}

function EmbedTile({ embed }: { embed: LinkEmbed }) {
  if (embed.provider === "spotify") {
    return (
      <iframe
        src={embed.embedUrl}
        className="w-full mt-2 border-0"
        style={{ height: 80 }}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
        title="spotify"
      />
    );
  }
  if (embed.provider === "youtube") {
    return (
      <div className="mt-2 relative w-full" style={{ aspectRatio: "16/9" }}>
        <iframe
          src={embed.embedUrl}
          className="absolute inset-0 w-full h-full border-0"
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="youtube"
        />
      </div>
    );
  }
  if (embed.provider === "soundcloud") {
    return (
      <iframe
        src={embed.embedUrl}
        className="w-full mt-2 border-0"
        style={{ height: 80 }}
        loading="lazy"
        title="soundcloud"
      />
    );
  }
  return (
    <a
      href={embed.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-block text-[10px] font-mono tracking-widest text-muted-foreground hover:text-foreground break-all"
    >
      {embed.host}
    </a>
  );
}

function SimpleAudio({ src }: { src: string }) {
  return (
    <audio
      controls
      src={src}
      className="mt-2 w-full"
      style={{ height: 32, filter: "invert(0.85) hue-rotate(180deg) saturate(0.6)" }}
    />
  );
}

export default function ConsoleChat({ roomId }: { roomId: number }) {
  const messagesQueryKey = getGetRoomMessagesQueryKey(roomId, { limit: 60 });
  const { data: messages } = useGetRoomMessages(
    roomId,
    { limit: 60 },
    { query: { queryKey: messagesQueryKey, refetchInterval: 2500 } },
  );
  const { data: me } = useGetMe();
  const sendMessage = useSendMessage();
  const requestUploadUrl = useRequestUploadUrl();
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeenIdRef = useRef<number>(0);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      setNow((performance.now() - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const maxId = Math.max(...messages.map((m) => m.id));
    if (lastSeenIdRef.current !== 0 && maxId > lastSeenIdRef.current) {
      setPulse((p) => p + 1);
    }
    lastSeenIdRef.current = maxId;
  }, [messages]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    stopStream();
    if (timerRef.current) clearInterval(timerRef.current);
  }, [stopStream]);

  const uploadAndSend = useCallback(async (blob: Blob, fileName?: string) => {
    setUploading(true);
    setError(null);
    try {
      const mime = blob.type || "audio/webm";
      const ext = fileName?.split(".").pop()?.toLowerCase()
        || (mime.includes("mp4") ? "mp4"
          : mime.includes("ogg") ? "ogg"
          : mime.includes("mpeg") || mime.includes("mp3") ? "mp3"
          : mime.includes("wav") ? "wav"
          : "webm");
      const name = fileName || `capture.${ext}`;
      const urlData = await requestUploadUrl.mutateAsync({
        data: { name, size: blob.size, contentType: mime },
      });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", urlData.uploadURL);
        xhr.setRequestHeader("Content-Type", mime);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("upload failed"));
        xhr.send(blob);
      });
      await sendMessage.mutateAsync({
        roomId,
        data: {
          content: content.trim() || null,
          mediaType: "audio",
          mediaUrl: urlData.objectPath,
        },
      });
      setContent("");
      setPulse((p) => p + 1);
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : "transmission failed");
    } finally {
      setUploading(false);
    }
  }, [content, roomId, requestUploadUrl, sendMessage, queryClient, messagesQueryKey]);

  const startRecording = useCallback(async () => {
    if (recording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeOptions = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
      const supportedMime = mimeOptions.find((m) => MediaRecorder.isTypeSupported(m)) || "";
      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);
      const actualMime = recorder.mimeType || supportedMime || "audio/webm";
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: actualMime });
        if (blob.size > 0) uploadAndSend(blob);
      };
      recorder.start(250);
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      setError("microphone access denied");
    }
  }, [recording, stopStream, uploadAndSend]);

  const stopRecording = useCallback(() => {
    if (!recording) return;
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [recording]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setError("file too large (max 50mb)");
      return;
    }
    if (!file.type.startsWith("audio/")) {
      setError("only audio files");
      return;
    }
    uploadAndSend(file, file.name);
  }, [uploadAndSend]);

  const submitLink = useCallback(() => {
    const raw = linkValue.trim();
    if (!raw) return;
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(normalized);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        setError("invalid link");
        return;
      }
    } catch {
      setError("invalid link");
      return;
    }
    sendMessage.mutate(
      { roomId, data: { content: normalized } },
      {
        onSuccess: () => {
          setLinkValue("");
          setLinkOpen(false);
          setPulse((p) => p + 1);
          queryClient.invalidateQueries({ queryKey: messagesQueryKey });
        },
      },
    );
  }, [linkValue, roomId, sendMessage, queryClient, messagesQueryKey]);

  const submitText = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    sendMessage.mutate(
      { roomId, data: { content } },
      {
        onSuccess: () => {
          setContent("");
          setPulse((p) => p + 1);
          queryClient.invalidateQueries({ queryKey: messagesQueryKey });
        },
      },
    );
  }, [content, roomId, sendMessage, queryClient, messagesQueryKey]);

  const orderedNewestFirst = useMemo(() => {
    if (!messages) return [];
    return [...messages].sort((a, b) => b.id - a.id);
  }, [messages]);

  const visibleMessages = orderedNewestFirst.slice(0, 8);

  const hueA = (now * 6) % 360;
  const hueB = (now * 4 + 120) % 360;
  const activity = Math.min((messages?.length ?? 0) / 40, 1);
  const isBusy = sendMessage.isPending || uploading;

  return (
    <div
      className={`bio-console relative w-full border border-border overflow-hidden ${pulse % 2 === 0 ? "" : "bio-strobe"}`}
      style={{
        height: 520,
        background: `radial-gradient(ellipse at 50% 55%, hsla(${hueA},60%,18%,0.55) 0%, hsla(${hueB},50%,8%,0.4) 40%, rgba(0,0,0,0.95) 80%)`,
        transition: "background 1.2s linear",
      }}
    >
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 1000 600"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="bio-pinch" cx="50%" cy="55%" r="40%">
            <stop offset="0%" stopColor={`hsla(${hueA},80%,60%,0.55)`} />
            <stop offset="40%" stopColor={`hsla(${hueB},70%,40%,0.18)`} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <linearGradient id="bio-wedge-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`hsla(${hueA},70%,55%,0.65)`} />
            <stop offset="100%" stopColor="rgba(40,80,180,0.05)" />
          </linearGradient>
          <linearGradient id="bio-wedge-b" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsla(${hueB},60%,50%,0.55)`} />
            <stop offset="100%" stopColor="rgba(190,40,40,0.05)" />
          </linearGradient>
          <filter id="bio-blur">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        {Array.from({ length: 14 }).map((_, i) => {
          const ang = (i / 14) * Math.PI * 2 + now * 0.04;
          const r = 380 + Math.sin(now * 0.5 + i) * 30;
          const x = 500 + Math.cos(ang) * r;
          const y = 330 + Math.sin(ang) * r * 0.65;
          const wid = 60 + Math.sin(now * 0.7 + i * 1.7) * 20;
          return (
            <polygon
              key={i}
              points={`${x},${y} ${x + wid},${y - wid * 0.4} 500,330 ${x - wid * 0.3},${y + wid * 0.6}`}
              fill={i % 2 === 0 ? "url(#bio-wedge-a)" : "url(#bio-wedge-b)"}
              opacity={0.35 + 0.25 * Math.sin(now * 0.6 + i)}
              filter="url(#bio-blur)"
            />
          );
        })}

        {Array.from({ length: 22 }).map((_, i) => {
          const ang = (i / 22) * Math.PI * 2 + now * 0.06;
          const r = 230 + Math.sin(now * 0.9 + i * 0.6) * 18;
          const x = 500 + Math.cos(ang) * r;
          const y = 330 + Math.sin(ang) * r * 0.7;
          return (
            <g key={i} opacity={0.55 + 0.4 * Math.sin(now + i)}>
              <line
                x1={x}
                y1={y}
                x2={500}
                y2={330}
                stroke={`hsla(${(hueA + i * 12) % 360},60%,55%,0.18)`}
                strokeWidth={0.6}
              />
              <circle
                cx={x}
                cy={y}
                r={2.5 + Math.sin(now * 1.2 + i) * 1.5}
                fill={`hsla(${(hueB + i * 8) % 360},80%,60%,0.85)`}
              />
            </g>
          );
        })}

        <circle cx={500} cy={330} r={28 + activity * 14} fill="url(#bio-pinch)" />
        <circle
          cx={500}
          cy={330}
          r={6 + Math.sin(now * 2) * 2}
          fill={`hsla(${hueA},90%,70%,0.95)`}
        />
      </svg>

      <div className="absolute inset-0 pointer-events-none">
        {visibleMessages.map((msg, idx) => {
          const ageRatio = idx / Math.max(visibleMessages.length - 1, 1);
          const ang = (idx * 2.39996 + now * 0.05) % (Math.PI * 2);
          const radius = 38 - ageRatio * 30;
          const cx = 50 + Math.cos(ang) * radius;
          const cy = 55 + Math.sin(ang) * radius * 0.62;
          const opacity = Math.max(0.15, 1 - ageRatio * 0.85);
          const scale = 1 - ageRatio * 0.4;
          const url = findFirstUrl(msg.content);
          const embed = url ? parseEmbed(url) : null;
          const isOwn = me?.id != null && msg.userId === me.id;
          const isHovered = hovered === msg.id;
          const fragmenting = ageRatio > 0.55;
          return (
            <div
              key={msg.id}
              onMouseEnter={() => setHovered(msg.id)}
              onMouseLeave={() => setHovered((h) => (h === msg.id ? null : h))}
              className={`bio-msg pointer-events-auto absolute font-mono ${fragmenting ? "bio-msg-fragment" : ""} ${isHovered ? "bio-msg-hover" : ""}`}
              style={{
                left: `${cx}%`,
                top: `${cy}%`,
                transform: `translate(-50%, -50%) scale(${scale})`,
                ["--bio-scale" as string]: scale,
                opacity,
                maxWidth: 280,
                padding: "8px 10px",
                background: `linear-gradient(135deg, hsla(${(hueA + idx * 25) % 360},45%,12%,0.85), hsla(${(hueB + idx * 17) % 360},45%,8%,0.85))`,
                border: `1px solid hsla(${(hueA + idx * 30) % 360},60%,55%,${0.45 - ageRatio * 0.3})`,
                boxShadow: isOwn
                  ? `0 0 18px hsla(${hueA},80%,60%,0.35), inset 0 0 8px hsla(${hueB},80%,60%,0.18)`
                  : `0 0 10px hsla(${hueB},60%,40%,0.25)`,
                transition: "left 1.5s ease-out, top 1.5s ease-out, opacity 0.8s, transform 1.2s",
                zIndex: 10 - idx,
              }}
            >
              <div
                className="text-[8px] tracking-[0.25em] mb-1"
                style={{ color: `hsla(${(hueA + idx * 25) % 360},80%,75%,0.85)` }}
              >
                {msg.isSystemMessage ? "SYSTEM" : (msg.maskedSenderLabel || "UNKNOWN")}
              </div>
              {msg.content && (
                <div
                  className="text-[11px] leading-snug break-words"
                  style={{
                    color: `hsla(40, 20%, ${88 - ageRatio * 25}%, 0.95)`,
                    textShadow: fragmenting
                      ? `1px 0 hsla(${hueA},80%,60%,0.6), -1px 0 hsla(${hueB},80%,60%,0.6)`
                      : undefined,
                  }}
                >
                  {msg.content}
                </div>
              )}
              {embed && <EmbedTile embed={embed} />}
              {msg.mediaType === "audio" && msg.mediaUrl && (
                <SimpleAudio src={`/api/storage${msg.mediaUrl}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="absolute left-0 right-0 bottom-0 p-3 z-20">
        {error && (
          <div className="mb-2 flex items-center justify-between gap-2 bg-black/70 backdrop-blur border border-destructive/50 px-2 py-1 text-[10px] font-mono text-destructive">
            <span className="lowercase tracking-widest">{error}</span>
            <button onClick={() => setError(null)}>
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {linkOpen && (
          <div className="mb-2 flex items-center gap-2 bg-black/70 backdrop-blur border border-border px-2 py-1.5">
            <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="url"
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitLink(); } }}
              className="flex-1 min-w-0 bg-transparent text-xs font-mono focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={submitLink}
              disabled={!linkValue.trim() || sendMessage.isPending}
              className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest border border-border hover:border-foreground disabled:opacity-30"
            >
              <Send className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => { setLinkOpen(false); setLinkValue(""); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <form
          onSubmit={submitText}
          className={`flex gap-1 items-center bg-black/70 backdrop-blur border border-border px-2 py-1.5 ${pulse % 2 === 0 ? "" : "bio-composer-strobe"}`}
        >
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={isBusy && !recording}
            className={`w-8 h-8 flex items-center justify-center transition-colors ${recording ? "text-[var(--depth-red)] bio-rec" : "text-muted-foreground hover:text-foreground"}`}
            aria-label="record"
          >
            {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="upload"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setLinkOpen((v) => !v)}
            disabled={isBusy}
            className={`w-8 h-8 flex items-center justify-center transition-colors ${linkOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            aria-label="link"
          >
            <Link2 className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 min-w-0 bg-transparent px-2 py-2 text-xs font-mono focus:outline-none"
            disabled={isBusy}
          />
          {recording && (
            <span className="text-[10px] font-mono text-[var(--depth-red)] tabular-nums">
              {recordingSeconds}s
            </span>
          )}
          <button
            type="submit"
            disabled={!content.trim() || isBusy}
            aria-label="send"
            className="w-8 h-8 flex items-center justify-center border border-border hover:border-foreground disabled:opacity-30 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFile}
          className="hidden"
        />
      </div>
    </div>
  );
}
