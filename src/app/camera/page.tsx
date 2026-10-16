"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Peer, { type MediaConnection } from "peerjs";
import { Camera, Radio, Square, Video } from "lucide-react";
import { RECEIVER_PEER_ID } from "@/lib/room";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const [status, setStatus] = useState("Lista para iniciar");
  const [cameraActive, setCameraActive] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");

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
    let connected = false;
    const pc = call.peerConnection;
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "connected") {
        connected = true;
        setConnectionState("connected");
        setStatus("Transmitiendo en directo a OBS");
        setError("");
      } else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        setConnectionState("connecting");
        setStatus("Reconectando automáticamente…");
        if (!connected || pc.connectionState !== "disconnected") scheduleRetry();
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

  async function startCamera() {
    setError("");
    stoppedRef.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("La cámara requiere HTTPS. Abre la página publicada en Vercel.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
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
    }
  }

  function stopCamera() {
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
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-7 md:py-10">
      <Link href="/" className="text-sm text-blue-400 hover:text-blue-300">← StreamVerse</Link>
      <header className="mb-6 mt-7">
        <div className="flex items-center gap-2 text-blue-400"><Camera size={20} /><span className="text-sm font-bold uppercase tracking-widest">Transmisor móvil</span></div>
        <h1 className="mt-3 text-3xl font-black md:text-4xl">StreamVerse Camera</h1>
        <p className="mt-2 text-slate-400">Inicia la cámara y StreamVerse buscará OBS automáticamente. No hay salas ni códigos.</p>
      </header>
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-black">
        <div className="relative aspect-video">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
          {!cameraActive && <div className="absolute inset-0 grid place-items-center text-slate-500"><div className="text-center"><Video size={42} className="mx-auto mb-3" /><p>La vista previa aparecerá aquí</p></div></div>}
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-xs"><span className={`h-2 w-2 rounded-full ${cameraActive ? "bg-green-400" : "bg-slate-500"}`} />{cameraActive ? "CÁMARA ACTIVA" : "CÁMARA INACTIVA"}</div>
          {connectionState === "connected" && <div className="absolute right-3 top-3 rounded-full bg-red-600 px-3 py-2 text-xs font-bold">LIVE</div>}
        </div>
      </div>
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[.03] p-5">
        <div className="mb-4 flex items-center gap-3"><Radio className="text-blue-400" /><div><p className="font-semibold">Conexión automática</p><p className="text-sm text-slate-400">Receiver fijo de OBS · sin código</p></div></div>
        {!cameraActive
          ? <button type="button" onClick={startCamera} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold hover:bg-blue-500"><Camera size={18} /> Iniciar cámara y transmitir</button>
          : <button type="button" onClick={stopCamera} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 py-3 font-bold text-red-300 hover:bg-red-500/10"><Square size={16} /> Detener cámara</button>}
        <p className="mt-4 text-sm text-slate-400">Estado: <span className="text-white">{status}</span></p>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-950/50 p-3 text-sm text-red-300">{error}</p>}
      </section>
    </main>
  );
}
