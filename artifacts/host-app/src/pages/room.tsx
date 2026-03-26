import { useParams, Link } from "wouter";
import {
  useGetRoomMessages,
  useSendMessage,
  useGetMyRole,
  useRequestUploadUrl,
} from "@workspace/api-client-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, TerminalSquare, Camera, Mic, MicOff, X, Send, ImageIcon, Volume2 } from "lucide-react";

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

  // Open camera
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
      setError("Camera access denied. Allow permissions and try again.");
    }
  }, [clearCaptures]);

  // Capture photo from video feed
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

  // Start audio recording
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
      setError("Microphone access denied. Allow permissions and try again.");
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
        name: `capture.${ext}`,
        size: mediaBlob.size,
        contentType: mime,
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
      setError("Transmission failed. Signal lost.");
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
    return <div className="flex-1 flex items-center justify-center font-mono text-muted-foreground">Decrypting stream...</div>;
  }

  const isPeripheral = role?.roleType === "peripheral";
  const hasPending = !!capturedPhoto || !!capturedAudio;
  const isBusy = sendMessageMutation.isPending || isUploading;

  return (
    <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-4 py-6 h-[calc(100vh-4rem)]">
      <header className="flex justify-between items-center mb-6 pb-4 border-b border-border shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Retreat
        </Link>
        <div className="flex items-center gap-3">
          <TerminalSquare className="w-5 h-5 text-primary" />
          <span className="font-serif text-xl uppercase tracking-[0.2em]">Comm Channel {roomId}</span>
        </div>
      </header>

      {/* Message feed */}
      <div className="flex-1 overflow-y-auto mb-4 pr-2 space-y-4 flex flex-col font-mono text-sm">
        {messages?.length === 0 && (
          <div className="text-center text-muted-foreground italic my-auto">
            Channel silent. Be the first to emit.
          </div>
        )}
        {messages?.map((msg) => {
          const isSystem = msg.isSystemMessage;
          return (
            <div
              key={msg.id}
              className={`p-4 border ${isSystem ? "bg-primary/5 border-primary/30 text-primary" : "bg-card border-border"}`}
            >
              <div className="flex justify-between items-start mb-2 text-xs opacity-70 border-b border-border/50 pb-2">
                <span className="font-bold tracking-wider">
                  {isSystem ? "SYSTEM_BROADCAST" : (msg.maskedSenderLabel || "UNKNOWN-ENTITY")}
                </span>
                <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
              </div>
              {msg.content && <p className="whitespace-pre-wrap text-foreground mb-2">{msg.content}</p>}
              {msg.mediaType === "image" && msg.mediaUrl && (
                <div className="mt-2">
                  <img
                    src={`/api/storage/objects${msg.mediaUrl}`}
                    alt="Transmitted image"
                    className="max-w-xs max-h-64 object-contain border border-border/50"
                    loading="lazy"
                  />
                </div>
              )}
              {msg.mediaType === "audio" && msg.mediaUrl && (
                <div className="mt-2 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-primary shrink-0" />
                  <audio
                    controls
                    src={`/api/storage/objects${msg.mediaUrl}`}
                    className="h-8"
                    style={{ filter: "invert(1) sepia(1) hue-rotate(10deg)" }}
                  />
                </div>
              )}
            </div>
          );
        })}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Error bar */}
      {error && (
        <div className="shrink-0 mb-2 px-4 py-2 border border-red-800/50 bg-red-950/30 text-red-400 text-xs font-mono flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Camera preview overlay */}
      {mediaMode === "camera" && !capturedPhoto && (
        <div className="shrink-0 mb-4 relative border border-border bg-black">
          <video ref={videoRef} className="w-full max-h-48 object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-4">
            <button
              onClick={capturePhoto}
              className="px-6 py-2 bg-primary text-black font-bold text-xs uppercase tracking-widest hover:bg-primary/80"
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

      {/* Hidden canvas (used for photo capture) */}
      {mediaMode !== "camera" && <canvas ref={canvasRef} className="hidden" />}

      {/* Captured photo preview */}
      {capturedPhoto && (
        <div className="shrink-0 mb-4 relative border border-primary/30 bg-black flex items-center gap-3 px-3 py-2">
          <ImageIcon className="w-4 h-4 text-primary shrink-0" />
          <img
            src={URL.createObjectURL(capturedPhoto)}
            alt="Captured"
            className="h-16 w-16 object-cover border border-border/50"
          />
          <span className="text-xs font-mono text-muted-foreground flex-1">Image captured — ready to transmit</span>
          <button onClick={clearCaptures} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Audio recording indicator / captured audio */}
      {(isRecording || capturedAudio) && (
        <div className="shrink-0 mb-4 border border-primary/30 bg-black flex items-center gap-3 px-3 py-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isRecording ? "bg-red-500 animate-pulse" : "bg-primary"}`} />
          <span className="text-xs font-mono text-muted-foreground flex-1">
            {isRecording ? `Recording… ${recordingSeconds}s` : "Voice captured — ready to transmit"}
          </span>
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="px-4 py-1 border border-red-700 text-red-400 text-xs font-mono uppercase hover:bg-red-950/40"
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

      {/* Input bar */}
      <div className="shrink-0 bg-card border border-border p-2">
        {isPeripheral ? (
          <div className="p-4 text-center text-xs uppercase tracking-widest text-muted-foreground opacity-50">
            Write access restricted. Observation only.
          </div>
        ) : (
          <form onSubmit={handleSendText} className="flex gap-2 items-center">
            {!hasPending && (
              <>
                <button
                  type="button"
                  onClick={mediaMode === "camera" ? clearCaptures : openCamera}
                  title="Camera"
                  className="p-2 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Camera className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  title={isRecording ? "Stop recording" : "Record voice"}
                  className={`p-2 transition-colors ${isRecording ? "text-red-400" : "text-muted-foreground hover:text-primary"}`}
                >
                  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              </>
            )}
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={hasPending ? "Add a caption (optional)..." : "Transmit sequence..."}
              className="flex-1 bg-background border-none px-4 py-3 focus:outline-none font-mono text-sm"
              disabled={isBusy}
            />
            <button
              type="submit"
              disabled={(!content.trim() && !hasPending) || isBusy}
              className="flex items-center gap-2 px-5 py-3 bg-foreground text-background font-bold tracking-widest text-xs uppercase hover:bg-primary transition-colors disabled:opacity-40"
            >
              {isBusy ? (
                <span className="animate-pulse">···</span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Emit
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
