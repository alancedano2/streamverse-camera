"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Peer, { type MediaConnection } from "peerjs";
import {
  Camera,
  Check,
  ChevronDown,
  Radio,
  RotateCw,
  SlidersHorizontal,
  Square,
  Video,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { RECEIVER_PEER_ID } from "@/lib/room";

type ConnectionState = "idle" | "connecting" | "connected" | "error";
type Resolution = "720p" | "1080p" | "4k";

type CameraOption = {
  deviceId: string;
  label: string;
};

const RESOLUTIONS: Record<Resolution, { width: number; height: number; label: string }> = {
  "720p": { width: 1280, height: 720, label: "HD · 720p" },
  "1080p": { width: 1920, height: 1080, label: "Full HD · 1080p" },
  "4k": { width: 3840, height: 2160, label: "4K · 2160p" },
};

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const startingRef = useRef(false);

  const [status, setStatus] = useState("Lista para iniciar");
  const [cameraActive, setCameraActive] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1, step: 0.1 });
  const [zoomSupported, setZoomSupported] = useState(false);
  const [switching, setSwitching] = useState(false);

  const refreshCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Cámara ${index + 1}`,
        }));
      setCameras(videoInputs);
      if (!selectedCamera && videoInputs[0]) setSelectedCamera(videoInputs[0].deviceId);
    } catch {
      // La lista se vuelve a cargar al conceder permiso a la cámara.
    }
  }, [selectedCamera]);

  useEffect(() => {
    void refreshCameras();
  }, [refreshCameras]);

  useEffect(() => () => {
    stoppedRef.current = true;
    if (retryRef.current) clearTimeout(retryRef.current);
    callRef.current?.close();
    peerRef.current?.destroy();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function scheduleRetry() {
    if (stoppedRef.current || !streamRef.current) return;
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = setTimeout(() => callReceiver(), 1800);
  }

  function callReceiver() {
    const peer = peerRef.current;
    const stream = streamRef.current;
    if (!peer || !stream || stoppedRef.current || peer.destroyed) return;
    if (!peer.open) {
      scheduleRetry();
      return;
    }

    setConnectionState("connecting");
    setStatus("Buscando StreamVerse Receiver automáticamente…");
    const call = peer.call(RECEIVER_PEER_ID, stream);
    if (!call) {
      scheduleRetry();
      return;
    }

    callRef.current?.close();
    callRef.current = call;
    const pc = call.peerConnection;
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "connected") {
        setConnectionState("connected");
        setStatus("Transmitiendo en directo a OBS");
        setError("");
      } else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        setConnectionState("connecting");
        setStatus("Reconectando automáticamente…");
        scheduleRetry();
      }
    });
    call.on("close", () => {
      if (callRef.current === call) callRef.current = null;
      if (!stoppedRef.current) {
        setConnectionState("connecting");
        setStatus("Receiver desconectado; buscando de nuevo…");
        scheduleRetry();
      }
    });
    call.on("error", (err) => {
      setError(err.message);
      setConnectionState("connecting");
      setStatus("No se encontró Receiver; reintentando…");
      scheduleRetry();
    });
  }

  function updateZoomCapabilities(track: MediaStreamTrack) {
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
      zoom?: number | { min: number; max: number; step?: number };
    };
    const value = capabilities.zoom;
    if (typeof value === "object" && value) {
      const min = value.min ?? 1;
      const max = value.max ?? 1;
      const step = value.step ?? 0.1;
      setZoomRange({ min, max, step });
      setZoomSupported(max > min);
      const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
      setZoom(settings.zoom ?? min);
    } else {
      setZoomRange({ min: 1, max: 1, step: 0.1 });
      setZoom(1);
      setZoomSupported(false);
    }
  }

  async function applyZoom(nextZoom: number) {
    setZoom(nextZoom);
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomSupported) return;
    try {
      await track.applyConstraints({
        advanced: [{ zoom: nextZoom } as MediaTrackConstraintSet],
      });
    } catch {
      setError("Este navegador no permite aplicar zoom óptico/digital por control de cámara.");
    }
  }

  async function makeStream(deviceId?: string, selectedResolution: Resolution = resolution) {
    const target = RESOLUTIONS[selectedResolution];
    const video: MediaTrackConstraints = {
      width: { ideal: target.width },
      height: { ideal: target.height },
      frameRate: { ideal: 30, max: 30 },
    };
    if (deviceId) video.deviceId = { exact: deviceId };
    else video.facingMode = { ideal: "environment" };

    return navigator.mediaDevices.getUserMedia({
      video,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  }

  async function startCamera() {
    if (startingRef.current) return;
    startingRef.current = true;
    setError("");
    stoppedRef.current = false;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("La cámara requiere HTTPS. Abre la página publicada en Vercel.");
      }

      const stream = await makeStream(selectedCamera || undefined);
      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      updateZoomCapabilities(videoTrack);
      await refreshCameras();
      if (videoTrack.getSettings().deviceId) {
        setSelectedCamera(videoTrack.getSettings().deviceId!);
      }

      setCameraActive(true);
      setConnectionState("connecting");
      setStatus("Cámara activa. Conectando automáticamente…");

      const peer = new Peer();
      peerRef.current = peer;
      peer.on("open", () => callReceiver());
      peer.on("disconnected", () => {
        setStatus("Reconectando al servicio de conexión…");
        peer.reconnect();
      });
      peer.on("error", (err) => {
        setError(`${err.type}: ${err.message}`);
        setStatus("Esperando conexión; se volverá a intentar automáticamente.");
        scheduleRetry();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la cámara.");
      setConnectionState("error");
    } finally {
      startingRef.current = false;
    }
  }

  async function replaceCamera(nextDeviceId: string, nextResolution: Resolution = resolution) {
    if (!cameraActive) {
      setSelectedCamera(nextDeviceId);
      setResolution(nextResolution);
      return;
    }

    setSwitching(true);
    setError("");
    try {
      const newStream = await makeStream(nextDeviceId, nextResolution);
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldStream = streamRef.current;
      const oldVideoTrack = oldStream?.getVideoTracks()[0];
      const currentCall = callRef.current;

      if (currentCall && !currentCall.peerConnection.connectionState.match(/closed|failed/)) {
        const sender = currentCall.peerConnection.getSenders().find(
          (item) => item.track?.kind === "video",
        );
        if (sender) await sender.replaceTrack(newVideoTrack);
      }

      if (oldVideoTrack) {
        oldStream?.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      // Conserva la pista de audio existente para evitar cortes del micrófono.
      const audioTrack = oldStream?.getAudioTracks()[0];
      if (audioTrack) {
        newStream.getAudioTracks().forEach((track) => track.stop());
        newStream.removeTrack(newStream.getAudioTracks()[0]);
        newStream.addTrack(audioTrack);
      }
      streamRef.current = newStream;
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        await videoRef.current.play();
      }
      setSelectedCamera(nextDeviceId);
      setResolution(nextResolution);
      updateZoomCapabilities(newVideoTrack);
      setStatus("Cámara actualizada; transmisión activa");
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo cambiar la cámara o resolución: ${err.message}`
          : "No se pudo cambiar la cámara o resolución.",
      );
    } finally {
      setSwitching(false);
    }
  }

  async function stopCamera() {
    stoppedRef.current = true;
    if (retryRef.current) clearTimeout(retryRef.current);
    callRef.current?.close();
    callRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setConnectionState("idle");
    setStatus("Cámara detenida");
    setZoom(1);
    setZoomSupported(false);
  }

  const selectedResolution = RESOLUTIONS[resolution];

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 text-white md:px-6 md:py-10">
      <Link href="/" className="text-sm text-blue-400 transition hover:text-blue-300">
        ← StreamVerse
      </Link>

      <header className="mb-6 mt-6">
        <div className="flex items-center gap-2 text-blue-400">
          <Camera size={20} />
          <span className="text-xs font-bold uppercase tracking-[0.22em]">Transmisor móvil</span>
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
          StreamVerse <span className="text-blue-400">Camera</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Selecciona la cámara, ajusta la resolución y controla el zoom. El video y el audio se
          envían a OBS automáticamente al iniciar.
        </p>
      </header>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl shadow-blue-950/20">
        <div className="relative aspect-video">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-contain"
          />
          {!cameraActive && (
            <div className="absolute inset-0 grid place-items-center text-slate-500">
              <div className="text-center">
                <Video size={42} className="mx-auto mb-3" />
                <p className="text-sm">La vista previa aparecerá aquí</p>
              </div>
            </div>
          )}
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-[11px] font-bold tracking-wide">
            <span
              className={`h-2 w-2 rounded-full ${
                cameraActive ? "bg-emerald-400" : "bg-slate-500"
              }`}
            />
            {cameraActive ? "CÁMARA ACTIVA" : "CÁMARA INACTIVA"}
          </div>
          {connectionState === "connected" && (
            <div className="absolute right-3 top-3 rounded-full bg-red-600 px-3 py-2 text-xs font-black tracking-widest">
              LIVE
            </div>
          )}
          {switching && (
            <div className="absolute inset-0 grid place-items-center bg-black/50 text-sm font-semibold">
              <RotateCw className="mr-2 inline animate-spin" size={18} />
              Aplicando ajustes…
            </div>
          )}
        </div>
      </div>

      <section className="mt-5 rounded-3xl border border-white/10 bg-slate-950/70 p-4 md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="text-blue-400" size={19} />
          <h2 className="font-bold">Controles de cámara</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-300">Cámara</span>
            <span className="relative block">
              <select
                value={selectedCamera}
                onChange={(event) => void replaceCamera(event.target.value)}
                disabled={switching || cameras.length === 0}
                className="w-full appearance-none rounded-xl border border-white/10 bg-slate-900 px-3 py-3 pr-10 text-sm outline-none transition focus:border-blue-500 disabled:opacity-50"
              >
                {cameras.length === 0 && <option value="">Pulsa iniciar para detectar cámaras</option>}
                {cameras.map((camera, index) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label || `Cámara ${index + 1}`}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </span>
            <span className="mt-2 block text-xs text-slate-500">
              Las cámaras disponibles dependen del celular y del navegador.
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-300">Resolución</span>
            <span className="relative block">
              <select
                value={resolution}
                onChange={(event) =>
                  void replaceCamera(selectedCamera, event.target.value as Resolution)
                }
                disabled={switching}
                className="w-full appearance-none rounded-xl border border-white/10 bg-slate-900 px-3 py-3 pr-10 text-sm outline-none transition focus:border-blue-500 disabled:opacity-50"
              >
                {Object.entries(RESOLUTIONS).map(([value, option]) => (
                  <option key={value} value={value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </span>
            <span className="mt-2 block text-xs text-slate-500">
              Resolución solicitada: {selectedResolution.width} × {selectedResolution.height}.
              El dispositivo puede limitarla.
            </span>
          </label>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <ZoomIn size={18} className="text-blue-400" />
                Zoom
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {zoomSupported
                  ? "Zoom de cámara disponible"
                  : cameraActive
                    ? "El navegador no expone el zoom de esta cámara; puedes cambiar a otra cámara si está disponible."
                    : "Inicia la cámara para comprobar el zoom disponible."}
              </p>
            </div>
            <span className="rounded-lg bg-blue-500/10 px-3 py-2 text-sm font-black tabular-nums text-blue-300">
              {zoom.toFixed(1)}×
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void applyZoom(Math.max(zoomRange.min, zoom - zoomRange.step))}
              disabled={!cameraActive || !zoomSupported || switching}
              aria-label="Reducir zoom"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-slate-900 transition hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ZoomOut size={18} />
            </button>
            <input
              aria-label="Nivel de zoom"
              type="range"
              min={zoomRange.min}
              max={zoomRange.max}
              step={zoomRange.step}
              value={Math.min(zoomRange.max, Math.max(zoomRange.min, zoom))}
              onChange={(event) => void applyZoom(Number(event.target.value))}
              disabled={!cameraActive || !zoomSupported || switching}
              className="h-2 min-w-0 flex-1 cursor-pointer accent-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            />
            <button
              type="button"
              onClick={() => void applyZoom(Math.min(zoomRange.max, zoom + zoomRange.step))}
              disabled={!cameraActive || !zoomSupported || switching}
              aria-label="Aumentar zoom"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-slate-900 transition hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ZoomIn size={18} />
            </button>
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-500">
            <span>{zoomRange.min.toFixed(1)}×</span>
            <button
              type="button"
              onClick={() => void applyZoom(zoomRange.min)}
              disabled={!cameraActive || !zoomSupported || switching}
              className="font-semibold text-blue-400 hover:text-blue-300 disabled:opacity-40"
            >
              Restablecer zoom
            </button>
            <span>{zoomRange.max.toFixed(1)}×</span>
          </div>
        </div>

        <div className="mt-5 border-t border-white/10 pt-5">
          {!cameraActive ? (
            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={switching}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 font-bold transition hover:bg-blue-500 disabled:opacity-50"
            >
              <Camera size={18} />
              Iniciar cámara y transmitir
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void stopCamera()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 py-3.5 font-bold text-red-300 transition hover:bg-red-500/10"
            >
              <Square size={16} />
              Detener cámara
            </button>
          )}

          <div className="mt-4 flex items-start gap-3 rounded-xl bg-white/[0.03] p-3">
            <Radio className="mt-0.5 shrink-0 text-blue-400" size={18} />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">Conexión automática a OBS</p>
              <p className="mt-1 break-words text-slate-400">
                Estado: <span className="text-white">{status}</span>
              </p>
            </div>
            {connectionState === "connected" && (
              <Check className="ml-auto mt-0.5 shrink-0 text-emerald-400" size={18} />
            )}
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-xl border border-red-500/20 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
