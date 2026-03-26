import { useParams, Link } from "wouter";
import {
  useGetRoomMessages,
  useSendMessage,
  useGetMyRole,
  useRequestUploadUrl,
} from "@workspace/api-client-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Mic, MicOff, X, Send, ImageIcon, Volume2, Play, Pause, Loader2 } from "lucide-react";

function BlobAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const loadAudio = useCallback(async () => {
    if (blobUrl) return;
    setLoading(true);
    setError(false);
    try {
      const resp = await fetch(src);
      if (!resp.ok) throw new Error("fetch failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [src, blobUrl]);

  const togglePlay = useCallback(async () => {
    if (!blobUrl) {
      await loadAudio();
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  }, [blobUrl, playing, loadAudio]);

  useEffect(() => {
    if (!blobUrl) return;
    const audio = new Audio(blobUrl);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("timeupdate", () => setProgress(audio.currentTime));
    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("ended", () => { setPlaying(false); setProgress(0); });
    audio.addEventListener("error", () => setError(true));

    audio.play().catch(() => {});

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [blobUrl]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * duration;
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: "#999" }}>
        <Volume2 className="w-4 h-4" />
        <span>audio unavailable</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <button
        onClick={togglePlay}
        disabled={loading}
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "#333", color: "#f5f0e8" }}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : playing ? (
          <Pause className="w-3.5 h-3.5" />
        ) : (
          <Play className="w-3.5 h-3.5 ml-0.5" />
        )}
      </button>
      <div
        className="flex-1 h-1.5 rounded-full cursor-pointer"
        style={{ background: "#444" }}
        onClick={handleSeek}
      >
        <div
          className="h-full rounded-full"
          style={{
            background: "#f5f0e8",
            width: duration > 0 ? `${(progress / duration) * 100}%` : "0%",
            transition: "width 0.1s linear",
          }}
        />
      </div>
      <span className="text-xs shrink-0" style={{ color: "#999", fontFamily: "var(--font-mono)" }}>
        {duration > 0 ? formatTime(playing ? progress : duration) : "0:00"}
      </span>
    </div>
  );
}

type MediaMode = "none" | "camera" | "recording";

export default function Room() {
  const { id } = useParams();
  const roomId = parseInt(id || "0", 10);

  const { data: messages, isLoading } = useGetRoomMessages(roomId, { limit: 100 }, {
    query: { refetchInterval: 3000 },
  });
  const { data: role } = useGetMyRole();
  const sendMessageMutation = useSendMessage();
  const requestUploadUrlMutation = useRequestUploadUrl();
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [mediaMode, setMediaMode] = useState<MediaMode>("none");
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);
  const [capturedAudio, setCapturedAudio] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearCaptures = useCallback(() => {
    setCapturedPhoto(null);
    setCapturedAudio(null);
    setMediaMode("none");
    setIsRecording(false);
    setRecordingSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
    stopStream();
  }, [stopStream]);

  useEffect(() => () => { stopStream(); if (timerRef.current) clearInterval(timerRef.current); }, [stopStream]);

  const openCamera = useCallback(async () => {
    setError(null);
    clearCaptures();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setMediaMode("camera");
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      setError("Camera access denied.");
    }
  }, [clearCaptures]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedPhoto(blob);
        stopStream();
      }
    }, "image/jpeg", 0.85);
  }, [stopStream]);

  const startRecording = useCallback(async () => {
    setError(null);
    clearCaptures();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setCapturedAudio(blob);
        stopStream();
      };
      recorder.start(250);
      setIsRecording(true);
      setMediaMode("recording");
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      setError("Microphone access denied.");
    }
  }, [clearCaptures, stopStream]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const uploadAndSend = useCallback(async (mediaBlob: Blob, mediaType: "image" | "audio") => {
    setIsUploading(true);
    setError(null);
    try {
      const ext = mediaType === "image" ? "jpg" : "webm";
      const mime = mediaBlob.type || (mediaType === "image" ? "image/jpeg" : "audio/webm");
      const urlData = await requestUploadUrlMutation.mutateAsync({
        data: {
          name: `capture.${ext}`,
          size: mediaBlob.size,
          contentType: mime,
        },
      });

      const uploadRes = await fetch(urlData.uploadURL, {
        method: "PUT",
        body: mediaBlob,
        headers: { "Content-Type": mime },
      });

      if (!uploadRes.ok) throw new Error("Upload failed");

      await new Promise<void>((resolve, reject) => {
        sendMessageMutation.mutate(
          {
            roomId,
            data: {
              content: content.trim() || null,
              mediaType,
              mediaUrl: urlData.objectPath,
            },
          },
          {
            onSuccess: () => {
              setContent("");
              clearCaptures();
              queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/messages`] });
              resolve();
            },
            onError: (err) => reject(err),
          },
        );
      });
    } catch (err) {
      setError("Transmission failed.");
    } finally {
      setIsUploading(false);
    }
  }, [content, roomId, requestUploadUrlMutation, sendMessageMutation, queryClient, clearCaptures]);

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (capturedPhoto) { uploadAndSend(capturedPhoto, "image"); return; }
    if (capturedAudio) { uploadAndSend(capturedAudio, "audio"); return; }
    if (!content.trim()) return;
    sendMessageMutation.mutate(
      { roomId, data: { content } },
      {
        onSuccess: () => {
          setContent("");
          queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/messages`] });
        },
      },
    );
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center font-mono text-muted-foreground text-xs">...</div>;
  }

  const isPeripheral = role?.roleType === "peripheral";
  const hasPending = !!capturedPhoto || !!capturedAudio;
  const isBusy = sendMessageMutation.isPending || isUploading;

  return (
    <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-4 py-6 h-[calc(100vh-3.5rem)]">
      <header className="flex justify-between items-center mb-6 pb-4 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <span className="depth-text text-sm uppercase tracking-[0.2em]">Channel {roomId}</span>
      </header>

      <div className="weave-divider w-full mb-4 shrink-0" />

      <div className="flex-1 overflow-y-auto mb-4 pr-2 space-y-3 flex flex-col font-mono text-sm">
        {messages?.length === 0 && (
          <div className="text-center text-muted-foreground italic my-auto text-xs lowercase tracking-widest">
            silence. be the first to speak.
          </div>
        )}
        {messages?.map((msg) => {
          const isSystem = msg.isSystemMessage;
          return (
            <div
              key={msg.id}
              className={`p-4 border ${isSystem ? "border-primary/20 diamond-pattern" : "bg-card border-border"}`}
            >
              <div className="flex justify-between items-start mb-2 text-xs opacity-60 pb-2">
                <span className="font-medium tracking-wider">
                  {isSystem ? "SYSTEM" : (msg.maskedSenderLabel || "UNKNOWN")}
                </span>
                <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
              </div>
              {msg.content && <p className="whitespace-pre-wrap text-foreground mb-2">{msg.content}</p>}
              {msg.mediaType === "image" && msg.mediaUrl && (
                <div className="mt-2">
                  <img
                    src={`/api/storage${msg.mediaUrl}`}
                    alt="Transmitted image"
                    className="max-w-xs max-h-64 object-contain border border-border/50"
                    loading="lazy"
                  />
                </div>
              )}
              {msg.mediaType === "audio" && msg.mediaUrl && (
                <BlobAudioPlayer src={`/api/storage${msg.mediaUrl}`} />
              )}
            </div>
          );
        })}
        <div ref={endOfMessagesRef} />
      </div>

      {error && (
        <div className="shrink-0 mb-2 px-4 py-2 border border-destructive/30 text-destructive text-xs font-mono flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="w-3 h-3" /></button>
        </div>
      )}

      {mediaMode === "camera" && !capturedPhoto && (
        <div className="shrink-0 mb-4 relative border border-border bg-black">
          <video ref={videoRef} className="w-full max-h-48 object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-4">
            <button
              onClick={capturePhoto}
              className="px-6 py-2 border border-foreground text-foreground font-medium text-xs uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
            >
              Capture
            </button>
            <button
              onClick={clearCaptures}
              className="px-4 py-2 border border-border text-xs font-mono uppercase text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mediaMode !== "camera" && <canvas ref={canvasRef} className="hidden" />}

      {capturedPhoto && (
        <div className="shrink-0 mb-4 relative border border-border bg-card flex items-center gap-3 px-3 py-2">
          <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <img
            src={URL.createObjectURL(capturedPhoto)}
            alt="Captured"
            className="h-16 w-16 object-cover border border-border/50"
          />
          <span className="text-xs font-mono text-muted-foreground flex-1 lowercase">image ready</span>
          <button onClick={clearCaptures} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {(isRecording || capturedAudio) && (
        <div className="shrink-0 mb-4 border border-border bg-card flex items-center gap-3 px-3 py-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isRecording ? "bg-red-500 animate-pulse" : "bg-muted-foreground"}`} />
          <span className="text-xs font-mono text-muted-foreground flex-1 lowercase">
            {isRecording ? `recording ${recordingSeconds}s` : "voice ready"}
          </span>
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="px-4 py-1 border border-destructive/50 text-destructive text-xs font-mono uppercase hover:bg-destructive/10"
            >
              Stop
            </button>
          ) : (
            <button onClick={clearCaptures} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <div className="shrink-0 bg-card border border-border p-2">
        {isPeripheral ? (
          <div className="p-4 text-center text-xs uppercase tracking-widest text-muted-foreground opacity-40 lowercase">
            observation only
          </div>
        ) : (
          <form onSubmit={handleSendText} className="flex gap-2 items-center">
            {!hasPending && (
              <>
                <button
                  type="button"
                  onClick={mediaMode === "camera" ? clearCaptures : openCamera}
                  title="Camera"
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Camera className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  title={isRecording ? "Stop recording" : "Record voice"}
                  className={`p-2 transition-colors ${isRecording ? "text-red-400" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              </>
            )}
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={hasPending ? "caption (optional)..." : "speak..."}
              className="flex-1 bg-background border-none px-4 py-3 focus:outline-none font-mono text-sm"
              disabled={isBusy}
            />
            <button
              type="submit"
              disabled={(!content.trim() && !hasPending) || isBusy}
              className="flex items-center gap-2 px-5 py-3 border border-foreground text-foreground font-medium tracking-widest text-xs uppercase hover:bg-foreground hover:text-background transition-colors disabled:opacity-30"
            >
              {isBusy ? (
                <span className="animate-pulse">...</span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Send
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
