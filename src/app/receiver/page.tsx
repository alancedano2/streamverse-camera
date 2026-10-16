"use client";

import { useEffect, useRef, useState } from "react";
import Peer, { type MediaConnection } from "peerjs";
import { RECEIVER_PEER_ID } from "@/lib/room";

export default function ReceiverPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function bootReceiver() {
      if (disposed) return;
      const peer = new Peer(RECEIVER_PEER_ID);
      peerRef.current = peer;
      peer.on("call", (call) => {
        if (disposed) { call.close(); return; }
        callRef.current?.close();
        callRef.current = call;
        call.answer();
        call.on("stream", async (stream) => {
          if (disposed || !videoRef.current) return;
          videoRef.current.srcObject = stream;
          try { await videoRef.current.play(); } catch { /* OBS suele permitir reproducción automática */ }
          setConnected(true);
        });
        call.on("close", () => {
          setConnected(false);
          if (videoRef.current) videoRef.current.srcObject = null;
        });
        call.on("error", () => {
          setConnected(false);
        });
      });
      peer.on("disconnected", () => peer.reconnect());
      peer.on("error", (err) => {
        // Si el Receiver todavía no está listo o el ID se está liberando, reintenta.
        if (err.type === "unavailable-id" || err.type === "network" || err.type === "server-error") {
          peer.destroy();
          if (peerRef.current === peer) peerRef.current = null;
          retryTimer = setTimeout(bootReceiver, 2000);
        }
      });
    }

    bootReceiver();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      callRef.current?.close();
      peerRef.current?.destroy();
      peerRef.current = null;
    };
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-black" aria-label="StreamVerse Receiver para OBS">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls={false}
        muted={false}
        className="h-full w-full bg-black object-contain"
      />
      {!connected && <div className="absolute inset-0 bg-black" aria-label="Esperando la cámara del celular" />}
    </main>
  );
}
