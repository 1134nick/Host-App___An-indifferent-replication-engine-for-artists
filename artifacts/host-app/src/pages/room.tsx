import { useParams, Link } from "wouter";
import {
  useGetRoomMessages,
  useSendMessage,
  useGetMyRole,
  useGetMyRooms,
  useRequestUploadUrl,
  useDeleteMessage,
  useGetMe,
} from "@workspace/api-client-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mic, MicOff, X, Send, Volume2, VolumeX, Play, Pause, Loader2, Trash2, Radio, Zap } from "lucide-react";
import { fetchAndDecode, createEchoNode, getAudioContext, type EchoNode, type FxOptions } from "../lib/audio-engine";
import Waveform from "../components/waveform";
import AmbientDrone from "../components/ambient-drone";

type PlaybackMode = "single" | "continuous";

const CLEAN_FX: FxOptions = {
  playbackRate: 1, distortionAmount: 0, delayTime: 0, delayFeedback: 0,
  inputGain: 1, outputGain: 0.9, mix: 0.28, toneHz: 2800, highpassHz: 80,
};

function BlobAudioPlayer({
  src,
  onEnded,
  onPlay,
  onStop,
  autoPlay,
  isActive,
  fx,
  muted,
  onAnalyser,
}: {
  src: string;
  onEnded?: () => void;
  onPlay?: () => void;
  onStop?: () => void;
  autoPlay?: boolean;
  isActive: boolean;
  fx: FxOptions;
  muted: boolean;
  onAnalyser?: (a: AnalyserNode | null) => void;
}) {
  const echoNodeRef = useRef<EchoNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const rateAtStartRef = useRef(1);
  const rafRef = useRef<number>(0);
  const loadedRef = useRef(false);

  const onEndedRef = useRef(onEnded);
  const onPlayRef = useRef(onPlay);
  const onStopRef = useRef(onStop);
  const onAnalyserRef = useRef(onAnalyser);
  onEndedRef.current = onEnded;
  onPlayRef.current = onPlay;
  onStopRef.current = onStop;
  onAnalyserRef.current = onAnalyser;

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (echoNodeRef.current) {
      try {
        echoNodeRef.current.source.stop();
        echoNodeRef.current.source.disconnect();
        echoNodeRef.current.outputGain.disconnect();
        echoNodeRef.current.analyser.disconnect();
        echoNodeRef.current.distortion.disconnect();
        echoNodeRef.current.delay.disconnect();
        echoNodeRef.current.feedbackGain.disconnect();
        echoNodeRef.current.feedbackFilter.disconnect();
        echoNodeRef.current.inputGain.disconnect();
        echoNodeRef.current.highpass.disconnect();
        echoNodeRef.current.compressor.disconnect();
        echoNodeRef.current.tone.disconnect();
        echoNodeRef.current.dryGain.disconnect();
        echoNodeRef.current.wetGain.disconnect();
        echoNodeRef.current.limiter.disconnect();
      } catch {}
      echoNodeRef.current = null;
    }
    onAnalyserRef.current?.(null);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const loadBuffer = useCallback(async () => {
    if (bufferRef.current) return bufferRef.current;
    setLoading(true);
    setError(false);
    try {
      const buf = await fetchAndDecode(src);
      bufferRef.current = buf;
      setDuration(buf.duration);
      loadedRef.current = true;
      return buf;
    } catch {
      setError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [src]);

  const startPlayback = useCallback(async (fromOffset = 0) => {
    try {
      cleanup();
      const buf = bufferRef.current || (await loadBuffer());
      if (!buf) return;

      const rate = fx.playbackRate ?? 1;
      const node = createEchoNode(buf, fx);
      echoNodeRef.current = node;
      node.outputGain.gain.value = muted ? 0 : (fx.outputGain ?? 0.9);
      onAnalyserRef.current?.(node.analyser);

      const ac = getAudioContext();
      startTimeRef.current = ac.currentTime;
      offsetRef.current = fromOffset;
      rateAtStartRef.current = rate;

      node.source.onended = () => {
        setPlaying(false);
        setProgress(0);
        offsetRef.current = 0;
        onAnalyserRef.current?.(null);
        onStopRef.current?.();
        onEndedRef.current?.();
      };

      node.source.start(0, fromOffset);
      setPlaying(true);
      onPlayRef.current?.();

      const tick = () => {
        if (!echoNodeRef.current) return;
        const ac2 = getAudioContext();
        const currentRate = echoNodeRef.current.source.playbackRate.value;
        const elapsed = (ac2.currentTime - startTimeRef.current) * currentRate + fromOffset;
        setProgress(Math.min(elapsed, buf.duration));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {}
  }, [cleanup, loadBuffer, fx, muted]);

  const stopPlayback = useCallback(() => {
    if (echoNodeRef.current) {
      const ac = getAudioContext();
      const rate = echoNodeRef.current.source.playbackRate.value;
      const elapsed = (ac.currentTime - startTimeRef.current) * rate + offsetRef.current;
      offsetRef.current = elapsed;
    }
    cleanup();
    setPlaying(false);
    onStopRef.current?.();
  }, [cleanup]);

  const togglePlay = useCallback(async () => {
    try {
      if (playing) {
        stopPlayback();
      } else {
        if (!loadedRef.current) {
          await loadBuffer();
        }
        await startPlayback(offsetRef.current);
      }
    } catch {}
  }, [playing, stopPlayback, startPlayback, loadBuffer]);

  useEffect(() => {
    if (autoPlay && !playing) {
      startPlayback(0).catch(() => {});
    }
  }, [autoPlay]);

  const playingRef = useRef(false);
  playingRef.current = playing;

  useEffect(() => {
    if (!isActive && playingRef.current) {
      cleanup();
      setPlaying(false);
      setProgress(0);
      offsetRef.current = 0;
    }
  }, [isActive, cleanup]);

  useEffect(() => {
    if (echoNodeRef.current) {
      echoNodeRef.current.outputGain.gain.value = muted ? 0 : (fx.outputGain ?? 0.9);
    }
  }, [muted, fx.outputGain]);

  useEffect(() => {
    if (echoNodeRef.current && playing) {
      echoNodeRef.current.source.playbackRate.value = fx.playbackRate ?? 1;
    }
  }, [fx.playbackRate, playing]);

  useEffect(() => {
    if (echoNodeRef.current && playing) {
      const drive = fx.distortionAmount ?? 0;
      if (drive > 0) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          curve[i] = ((3 + drive) * x * 20 * deg) / (Math.PI + drive * Math.abs(x));
        }
        echoNodeRef.current.distortion.curve = curve;
      } else {
        echoNodeRef.current.distortion.curve = null;
      }
    }
  }, [fx.distortionAmount, playing]);

  useEffect(() => {
    if (echoNodeRef.current && playing) {
      echoNodeRef.current.delay.delayTime.value = Math.min(fx.delayTime ?? 0, 1.2);
      echoNodeRef.current.feedbackGain.gain.value = Math.min(fx.delayFeedback ?? 0, 0.75);
    }
  }, [fx.delayTime, fx.delayFeedback, playing]);

  useEffect(() => {
    if (echoNodeRef.current && playing) {
      echoNodeRef.current.inputGain.gain.value = fx.inputGain ?? 1;
    }
  }, [fx.inputGain, playing]);

  useEffect(() => {
    if (echoNodeRef.current && playing) {
      echoNodeRef.current.tone.frequency.value = fx.toneHz ?? 2800;
    }
  }, [fx.toneHz, playing]);

  useEffect(() => {
    if (echoNodeRef.current && playing) {
      echoNodeRef.current.highpass.frequency.value = fx.highpassHz ?? 80;
    }
  }, [fx.highpassHz, playing]);

  useEffect(() => {
    if (echoNodeRef.current && playing && fx.mix !== undefined) {
      const m = Math.max(0, Math.min(1, fx.mix));
      echoNodeRef.current.dryGain.gain.value = 1 - m;
      echoNodeRef.current.wetGain.gain.value = m;
    }
  }, [fx.mix, playing]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTo = pct * duration;
    if (playing) {
      startPlayback(seekTo);
    } else {
      offsetRef.current = seekTo;
      setProgress(seekTo);
    }
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
    <div className={`mt-2 ${playing ? "corrupt-text" : ""}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          disabled={loading}
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ background: playing ? "var(--depth-blue)" : "#333", color: "#f5f0e8" }}
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
              background: playing ? "var(--depth-blue)" : "#f5f0e8",
              width: duration > 0 ? `${(progress / duration) * 100}%` : "0%",
              transition: "width 0.05s linear",
              boxShadow: playing ? "0 0 6px var(--depth-blue)" : "none",
            }}
          />
        </div>
        <span className="text-xs shrink-0" style={{ color: playing ? "var(--depth-blue)" : "#999", fontFamily: "var(--font-mono)" }}>
          {duration > 0 ? `${formatTime(progress)} / ${formatTime(duration)}` : "0:00"}
        </span>
      </div>
    </div>
  );
}

type MediaMode = "none" | "recording" | "preview";
const TRACK_OPTIONS = [1, 2, 3, Infinity] as const;

export default function Room() {
  const { id } = useParams();
  const roomId = parseInt(id || "0", 10);

  const { data: messages, isLoading } = useGetRoomMessages(roomId, { limit: 100 }, {
    query: { refetchInterval: 3000 },
  });
  const { data: role } = useGetMyRole();
  const { data: me } = useGetMe();
  const { data: rooms } = useGetMyRooms();
  const currentRoom = rooms?.find((r) => r.id === roomId);
  const sendMessageMutation = useSendMessage();
  const requestUploadUrlMutation = useRequestUploadUrl();
  const deleteMessageMutation = useDeleteMessage();
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [mediaMode, setMediaMode] = useState<MediaMode>("none");
  const [capturedAudio, setCapturedAudio] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("single");
  const [activeMediaIds, setActiveMediaIds] = useState<Set<number>>(new Set());
  const [mutedIds, setMutedIds] = useState<Set<number>>(new Set());
  const [maxTracks, setMaxTracks] = useState<number>(Infinity);
  const [transitioning, setTransitioning] = useState(false);
  const [continuousHead, setContinuousHead] = useState<number | null>(null);

  const [speed, setSpeed] = useState(1);
  const [distortion, setDistortion] = useState(0);
  const [delayTime, setDelayTime] = useState(0);
  const [delayFeedback, setDelayFeedback] = useState(0);
  const [inputGain, setInputGain] = useState(1);
  const [outputGain, setOutputGain] = useState(0.9);
  const [mix, setMix] = useState(0.28);
  const [toneHz, setToneHz] = useState(2800);
  const [highpassHz, setHighpassHz] = useState(80);
  const [showFx, setShowFx] = useState(false);

  const fxOptions: FxOptions = useMemo(() => ({
    playbackRate: speed,
    distortionAmount: distortion,
    delayTime,
    delayFeedback,
    inputGain,
    outputGain,
    mix,
    toneHz,
    highpassHz,
  }), [speed, distortion, delayTime, delayFeedback, inputGain, outputGain, mix, toneHz, highpassHz]);

  const [currentAnalyser, setCurrentAnalyser] = useState<AnalyserNode | null>(null);
  const [previewAnalyser, setPreviewAnalyser] = useState<AnalyserNode | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const userScrolledRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  const playOrderRef = useRef<number[]>([]);

  const displayMessages = useMemo(() => {
    if (!messages) return [];
    return messages.filter((m) => !m.mediaType || m.mediaType === "audio");
  }, [messages]);

  const mediaMessages = useMemo(() => {
    return displayMessages.filter((m) => m.mediaType === "audio");
  }, [displayMessages]);

  const totalMessages = displayMessages.length;
  const anyPlaying = activeMediaIds.size > 0;
  const playingCount = activeMediaIds.size;

  const addActiveMedia = useCallback((msgId: number) => {
    setActiveMediaIds((prev) => {
      const next = new Set(prev);
      if (maxTracks !== Infinity && next.size >= maxTracks) {
        const oldest = playOrderRef.current.find((id) => next.has(id));
        if (oldest !== undefined) {
          next.delete(oldest);
          playOrderRef.current = playOrderRef.current.filter((id) => id !== oldest);
        }
      }
      next.add(msgId);
      playOrderRef.current = [...playOrderRef.current.filter((id) => id !== msgId), msgId];
      return next;
    });
  }, [maxTracks]);

  const removeActiveMedia = useCallback((msgId: number) => {
    setActiveMediaIds((prev) => {
      const next = new Set(prev);
      next.delete(msgId);
      return next;
    });
    playOrderRef.current = playOrderRef.current.filter((id) => id !== msgId);
  }, []);

  const toggleMute = useCallback((msgId: number) => {
    setMutedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }, []);

  const handleMediaEnded = useCallback((msgId: number) => {
    removeActiveMedia(msgId);

    if (playbackMode === "continuous" && continuousHead === msgId) {
      const idx = mediaMessages.findIndex((m) => m.id === msgId);
      if (idx >= 0 && idx < mediaMessages.length - 1) {
        const nextId = mediaMessages[idx + 1].id;
        setTransitioning(true);
        setContinuousHead(nextId);
        setTimeout(() => {
          setTransitioning(false);
        }, 600);
      } else {
        setContinuousHead(null);
      }
    }
  }, [playbackMode, continuousHead, mediaMessages, removeActiveMedia]);

  const handleMediaPlay = useCallback((msgId: number) => {
    addActiveMedia(msgId);
    if (playbackMode === "continuous" && continuousHead !== null && continuousHead !== msgId) {
      setContinuousHead(null);
      setPlaybackMode("single");
    }
  }, [addActiveMedia, playbackMode, continuousHead]);

  const handleMediaStop = useCallback((msgId: number) => {
    removeActiveMedia(msgId);
  }, [removeActiveMedia]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      userScrolledRef.current = scrollHeight - scrollTop - clientHeight > 80;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const newCount = messages?.length || 0;
    if (newCount > prevMessageCountRef.current && !userScrolledRef.current) {
      endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = newCount;
  }, [messages]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearCaptures = useCallback(() => {
    cancelledRef.current = true;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setCapturedAudio(null);
    setMediaMode("none");
    setIsRecording(false);
    setRecordingSeconds(0);
    setPreviewPlaying(false);
    setPreviewAnalyser(null);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    if (timerRef.current) clearInterval(timerRef.current);
    stopStream();
    setTimeout(() => { cancelledRef.current = false; }, 50);
  }, [stopStream, previewBlobUrl]);

  useEffect(() => {
    if (capturedAudio) {
      const url = URL.createObjectURL(capturedAudio);
      setPreviewBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewBlobUrl(null);
    }
  }, [capturedAudio]);

  useEffect(() => () => { stopStream(); if (timerRef.current) clearInterval(timerRef.current); }, [stopStream]);

  const startRecording = useCallback(async () => {
    setError(null);
    clearCaptures();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
        video: false,
      });
      streamRef.current = stream;
      audioChunksRef.current = [];
      const mimeOptions = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
      const supportedMime = mimeOptions.find(m => MediaRecorder.isTypeSupported(m)) || "";
      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);
      const actualMime = recorder.mimeType || supportedMime || "audio/webm";
      mediaRecorderRef.current = recorder;
      cancelledRef.current = false;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        if (cancelledRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: actualMime });
        setCapturedAudio(blob);
        setMediaMode("preview");
        setShowFx(true);
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

  const handleDeleteMessage = useCallback((messageId: number) => {
    deleteMessageMutation.mutate(
      { roomId, messageId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/messages`] });
        },
      },
    );
  }, [roomId, deleteMessageMutation, queryClient]);

  const uploadAndSend = useCallback(async (mediaBlob: Blob) => {
    setIsUploading(true);
    setError(null);
    try {
      const mime = mediaBlob.type || "audio/webm";
      const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";

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

      const hasFx = speed !== 1 || distortion > 0 || delayTime > 0 || delayFeedback > 0
        || inputGain !== 1 || outputGain !== 0.9 || mix !== 0.28 || toneHz !== 2800 || highpassHz !== 80;

      const mediaMeta = hasFx ? {
        fx: {
          playbackRate: speed,
          distortionAmount: distortion,
          delayTime,
          delayFeedback,
          inputGain,
          outputGain,
          mix,
          toneHz,
          highpassHz,
        },
      } : null;

      await new Promise<void>((resolve, reject) => {
        sendMessageMutation.mutate(
          {
            roomId,
            data: {
              content: content.trim() || null,
              mediaType: "audio",
              mediaUrl: urlData.objectPath,
              mediaMeta,
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
  }, [content, roomId, speed, distortion, delayTime, delayFeedback, inputGain, outputGain, mix, toneHz, highpassHz, requestUploadUrlMutation, sendMessageMutation, queryClient, clearCaptures]);

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
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

  const playAll = useCallback(() => {
    if (mediaMessages.length > 0) {
      setPlaybackMode("continuous");
      setContinuousHead(mediaMessages[0].id);
    }
  }, [mediaMessages]);

  const stopAll = useCallback(() => {
    setActiveMediaIds(new Set());
    playOrderRef.current = [];
    setContinuousHead(null);
    setPlaybackMode("single");
    setCurrentAnalyser(null);
  }, []);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center font-mono text-muted-foreground text-xs">...</div>;
  }

  const isPeripheral = role?.roleType === "peripheral";
  const isBusy = sendMessageMutation.isPending || isUploading;

  return (
    <div className={`flex-1 flex flex-col max-w-5xl mx-auto w-full px-4 py-6 h-[calc(100vh-3.5rem)] ${anyPlaying ? "glitch-active" : ""}`}>
      <header className="flex justify-between items-center mb-4 pb-3 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <span className={`depth-text text-sm uppercase tracking-[0.2em] ${anyPlaying ? "corrupt-text" : ""}`}>
          {currentRoom?.roomType === "general"
            ? "General"
            : currentRoom?.displayName || `Channel ${roomId}`}
        </span>
      </header>

      <div className="weave-divider w-full mb-2 shrink-0" />

      {currentAnalyser && anyPlaying && (
        <div className={`mb-2 shrink-0 border border-border/30 bg-black/40 px-2 py-1 ${transitioning ? "echo-transitioning" : ""}`}>
          <Waveform analyser={currentAnalyser} playing={anyPlaying} height={36} />
        </div>
      )}

      <div className="flex items-center justify-between mb-2 shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setPlaybackMode(playbackMode === "single" ? "continuous" : "single")}
            className={`flex items-center gap-1.5 px-3 py-1.5 border text-[10px] font-mono uppercase tracking-widest transition-all ${
              playbackMode === "continuous"
                ? "border-[var(--depth-blue)] text-[var(--depth-blue)] bg-[var(--depth-blue)]/5"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Radio className={`w-3 h-3 ${playbackMode === "continuous" ? "animate-pulse" : ""}`} />
            {playbackMode === "continuous" ? "CONTINUOUS" : "SINGLE"}
          </button>

          <div className="flex items-center border border-border">
            {TRACK_OPTIONS.map((opt) => (
              <button
                key={opt === Infinity ? "all" : opt}
                onClick={() => setMaxTracks(opt)}
                className={`px-2 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-all ${
                  maxTracks === opt
                    ? "bg-[var(--depth-blue)]/10 text-[var(--depth-blue)]"
                    : "text-muted-foreground hover:text-foreground"
                } ${opt !== TRACK_OPTIONS[0] ? "border-l border-border" : ""}`}
              >
                {opt === Infinity ? "ALL" : opt}
              </button>
            ))}
          </div>

          {mediaMessages.length > 0 && (
            <button
              onClick={playAll}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground transition-all"
            >
              <Zap className="w-3 h-3" />
              PLAY ALL
            </button>
          )}
          <button
            onClick={() => setShowFx(!showFx)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border text-[10px] font-mono uppercase tracking-widest transition-all ${
              showFx
                ? "border-[var(--depth-red)] text-[var(--depth-red)]"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            FX
          </button>
          <AmbientDrone messageCount={totalMessages} active={true} />
        </div>
        <div className="flex items-center gap-3">
          {anyPlaying && (
            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              {playingCount} PLAYING
            </span>
          )}
          {anyPlaying && (
            <button
              onClick={stopAll}
              className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors"
            >
              STOP ALL
            </button>
          )}
        </div>
      </div>

      {showFx && (
        <div className="shrink-0 mb-2 p-3 border border-border/50 bg-card/50 space-y-2">
          <div className="flex items-center gap-3">
            <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground w-16">SPEED</label>
            <input type="range" min="0.25" max="2" step="0.05" value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} className="flex-1 h-1 cursor-pointer" style={{ accentColor: "rgba(40,80,180,0.85)" }} />
            <span className="text-[9px] font-mono text-muted-foreground w-12 text-right">{speed.toFixed(2)}x</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground w-16">INPUT</label>
            <input type="range" min="0.5" max="2" step="0.01" value={inputGain} onChange={(e) => setInputGain(parseFloat(e.target.value))} className="flex-1 h-1 cursor-pointer" style={{ accentColor: "rgba(40,80,180,0.85)" }} />
            <span className="text-[9px] font-mono text-muted-foreground w-12 text-right">{inputGain.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground w-16">OUTPUT</label>
            <input type="range" min="0.2" max="1.2" step="0.01" value={outputGain} onChange={(e) => setOutputGain(parseFloat(e.target.value))} className="flex-1 h-1 cursor-pointer" style={{ accentColor: "rgba(40,80,180,0.85)" }} />
            <span className="text-[9px] font-mono text-muted-foreground w-12 text-right">{outputGain.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground w-16">HPASS</label>
            <input type="range" min="40" max="180" step="1" value={highpassHz} onChange={(e) => setHighpassHz(parseFloat(e.target.value))} className="flex-1 h-1 cursor-pointer" style={{ accentColor: "rgba(190,40,40,0.65)" }} />
            <span className="text-[9px] font-mono text-muted-foreground w-12 text-right">{Math.round(highpassHz)}Hz</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground w-16">TONE</label>
            <input type="range" min="500" max="8000" step="10" value={toneHz} onChange={(e) => setToneHz(parseFloat(e.target.value))} className="flex-1 h-1 cursor-pointer" style={{ accentColor: "rgba(40,80,180,0.85)" }} />
            <span className="text-[9px] font-mono text-muted-foreground w-12 text-right">{toneHz >= 1000 ? `${(toneHz / 1000).toFixed(1)}k` : `${Math.round(toneHz)}`}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground w-16">MIX</label>
            <input type="range" min="0" max="1" step="0.01" value={mix} onChange={(e) => setMix(parseFloat(e.target.value))} className="flex-1 h-1 cursor-pointer" style={{ accentColor: "rgba(190,40,40,0.85)" }} />
            <span className="text-[9px] font-mono text-muted-foreground w-12 text-right">{Math.round(mix * 100)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground w-16">CRUSH</label>
            <input type="range" min="0" max="100" step="1" value={distortion} onChange={(e) => setDistortion(parseFloat(e.target.value))} className="flex-1 h-1 cursor-pointer" style={{ accentColor: "rgba(190,40,40,0.85)" }} />
            <span className="text-[9px] font-mono text-muted-foreground w-12 text-right">{distortion}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground w-16">DELAY</label>
            <input type="range" min="0" max="1.2" step="0.01" value={delayTime} onChange={(e) => setDelayTime(parseFloat(e.target.value))} className="flex-1 h-1 cursor-pointer" style={{ accentColor: "rgba(40,80,180,0.85)" }} />
            <span className="text-[9px] font-mono text-muted-foreground w-12 text-right">{delayTime.toFixed(2)}s</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground w-16">FEEDBACK</label>
            <input type="range" min="0" max="0.75" step="0.01" value={delayFeedback} onChange={(e) => setDelayFeedback(parseFloat(e.target.value))} className="flex-1 h-1 cursor-pointer" style={{ accentColor: "rgba(190,40,40,0.65)" }} />
            <span className="text-[9px] font-mono text-muted-foreground w-12 text-right">{Math.round(delayFeedback * 100)}%</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            <button
              onClick={() => { setSpeed(1); setInputGain(1); setOutputGain(0.9); setHighpassHz(80); setToneHz(2800); setMix(0.28); setDistortion(0); setDelayTime(0); setDelayFeedback(0); }}
              className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground px-2 py-1 border border-border"
            >
              CLEAN
            </button>
            <button
              onClick={() => { setSpeed(0.92); setInputGain(1.05); setOutputGain(0.86); setHighpassHz(95); setToneHz(2400); setMix(0.30); setDistortion(18); setDelayTime(0.28); setDelayFeedback(0.42); }}
              className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-[var(--depth-red)] px-2 py-1 border border-border"
            >
              HAUNTED
            </button>
            <button
              onClick={() => { setSpeed(1.18); setInputGain(1.15); setOutputGain(0.82); setHighpassHz(120); setToneHz(1700); setMix(0.22); setDistortion(55); setDelayTime(0.08); setDelayFeedback(0.22); }}
              className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-[var(--depth-blue)] px-2 py-1 border border-border"
            >
              CRUSHED
            </button>
            <button
              onClick={() => { setSpeed(0.84); setInputGain(1); setOutputGain(0.88); setHighpassHz(70); setToneHz(1100); setMix(0.40); setDistortion(8); setDelayTime(0.52); setDelayFeedback(0.48); }}
              className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground px-2 py-1 border border-border"
            >
              SUBMERGED
            </button>
            <button
              onClick={() => { setSpeed(0.68); setInputGain(1.2); setOutputGain(0.72); setHighpassHz(105); setToneHz(900); setMix(0.55); setDistortion(42); setDelayTime(0.82); setDelayFeedback(0.68); }}
              className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-[var(--depth-red)] px-2 py-1 border border-border"
            >
              VOID
            </button>
            <button
              onClick={() => { setSpeed(1.32); setInputGain(0.95); setOutputGain(0.92); setHighpassHz(130); setToneHz(4200); setMix(0.16); setDistortion(14); setDelayTime(0.05); setDelayFeedback(0.14); }}
              className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground hover:text-[var(--depth-blue)] px-2 py-1 border border-border"
            >
              NERVE
            </button>
          </div>
          <div className="text-[8px] font-mono text-muted-foreground/50 mt-1 tracking-wider">
            signal: input gain → highpass → compressor → dry/wet split → tone/distortion/delay → limiter
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto mb-4 pr-2 space-y-3 flex flex-col font-mono text-sm"
      >
        {displayMessages.length === 0 && (
          <div className="text-center text-muted-foreground italic my-auto text-xs lowercase tracking-widest">
            silence. be the first to speak.
          </div>
        )}
        {displayMessages.map((msg) => {
          const isSystem = msg.isSystemMessage;
          const isOwn = me?.id != null && msg.userId === me.id;
          const isThisPlaying = activeMediaIds.has(msg.id);
          const isThisMuted = mutedIds.has(msg.id);
          const hasMedia = msg.mediaType === "audio";
          const isContinuousTarget = playbackMode === "continuous" && continuousHead === msg.id;
          return (
            <div
              key={msg.id}
              className={`p-4 border transition-all duration-300 ${
                isSystem
                  ? "border-primary/20 diamond-pattern"
                  : isThisPlaying
                    ? "echo-playing bg-card"
                    : "bg-card border-border"
              } ${isThisPlaying ? "glitch-msg" : ""} ${transitioning && isContinuousTarget ? "echo-transitioning" : ""}`}
            >
              <div className="flex justify-between items-start mb-2 text-xs opacity-60 pb-2">
                <span className={`font-medium tracking-wider ${isThisPlaying ? "echo-label" : ""}`}>
                  {isSystem ? "SYSTEM" : (msg.maskedSenderLabel || "UNKNOWN")}
                </span>
                <div className="flex items-center gap-2">
                  <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                  {hasMedia && (
                    <button
                      onClick={() => toggleMute(msg.id)}
                      className={`transition-colors ${isThisMuted ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
                      title={isThisMuted ? "Unmute" : "Mute"}
                    >
                      {isThisMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                    </button>
                  )}
                  {isOwn && !isSystem && (
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              {msg.content && <p className={`whitespace-pre-wrap text-foreground mb-2 ${isThisPlaying ? "corrupt-text" : ""}`}>{msg.content}</p>}
              {msg.mediaType === "audio" && msg.mediaUrl && (
                <BlobAudioPlayer
                  src={`/api/storage${msg.mediaUrl}`}
                  autoPlay={isContinuousTarget && !isThisPlaying}
                  isActive={isThisPlaying}
                  onEnded={() => handleMediaEnded(msg.id)}
                  onPlay={() => handleMediaPlay(msg.id)}
                  onStop={() => handleMediaStop(msg.id)}
                  fx={fxOptions}
                  muted={isThisMuted}
                  onAnalyser={isThisPlaying ? setCurrentAnalyser : undefined}
                />
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



      {mediaMode === "recording" && (
        <div className="shrink-0 mb-4 border border-border bg-card flex items-center gap-3 px-3 py-2">
          <span className="w-2 h-2 rounded-full shrink-0 bg-red-500 animate-pulse" />
          <span className="text-xs font-mono text-muted-foreground flex-1 lowercase">
            recording {recordingSeconds}s
          </span>
          <button
            onClick={stopRecording}
            className="px-4 py-1 border border-destructive/50 text-destructive text-xs font-mono uppercase hover:bg-destructive/10"
          >
            Stop
          </button>
        </div>
      )}

      {mediaMode === "preview" && previewBlobUrl && (
        <div className="shrink-0 mb-4 border border-[var(--depth-blue)]/40 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--depth-blue)]">
              preview — adjust fx before sending
            </span>
            <button onClick={clearCaptures} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {previewAnalyser && previewPlaying && (
            <div className="border border-border/30 bg-black/40 px-2 py-1">
              <Waveform analyser={previewAnalyser} playing={previewPlaying} height={36} />
            </div>
          )}

          <BlobAudioPlayer
            src={previewBlobUrl}
            isActive={true}
            onPlay={() => setPreviewPlaying(true)}
            onStop={() => { setPreviewPlaying(false); setPreviewAnalyser(null); }}
            onEnded={() => { setPreviewPlaying(false); setPreviewAnalyser(null); }}
            fx={fxOptions}
            muted={false}
            onAnalyser={setPreviewAnalyser}
          />

          <div className="flex gap-2 items-center pt-1">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="caption (optional)..."
              className="flex-1 bg-background border-b border-border px-2 py-2 focus:outline-none focus:border-[var(--depth-blue)] font-mono text-sm transition-colors"
              disabled={isBusy}
            />
            <button
              onClick={() => { if (capturedAudio) uploadAndSend(capturedAudio); }}
              disabled={isBusy}
              className="flex items-center gap-2 px-5 py-2 border border-foreground text-foreground font-medium tracking-widest text-xs uppercase hover:bg-foreground hover:text-background transition-colors disabled:opacity-30"
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
            <button
              onClick={clearCaptures}
              disabled={isBusy}
              className="px-4 py-2 border border-destructive/50 text-destructive text-xs font-mono uppercase hover:bg-destructive/10 transition-colors disabled:opacity-30"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {mediaMode !== "preview" && (
        <div className="shrink-0 bg-card border border-border p-2">
          {isPeripheral ? (
            <div className="p-4 text-center text-xs uppercase tracking-widest text-muted-foreground opacity-40 lowercase">
              observation only
            </div>
          ) : (
            <form onSubmit={handleSendText} className="flex gap-2 items-center">
              <button
                type="button"
                onClick={isRecording && mediaMode === "recording" ? stopRecording : startRecording}
                title={isRecording && mediaMode === "recording" ? "Stop recording" : "Record voice"}
                className={`p-2 transition-colors ${isRecording && mediaMode === "recording" ? "text-red-400" : "text-muted-foreground hover:text-foreground"}`}
              >
                {isRecording && mediaMode === "recording" ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="speak..."
                className="flex-1 bg-background border-none px-4 py-3 focus:outline-none font-mono text-sm"
                disabled={isBusy}
              />
              <button
                type="submit"
                disabled={!content.trim() || isBusy}
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
      )}
    </div>
  );
}
