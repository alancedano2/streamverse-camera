import Link from "next/link";
import { Camera, Monitor, Radio } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        <header className="mb-16 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 font-black text-white shadow-lg shadow-blue-950">SV</div>
          <div>
            <h1 className="text-xl font-bold tracking-wide">StreamVerse</h1>
            <p className="text-sm text-slate-400">Camera System</p>
          </div>
        </header>

        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[.3em] text-blue-400">Wireless production</p>
          <h2 className="text-4xl font-black leading-tight md:text-6xl">Tu cámara.<span className="block text-blue-400">Tu transmisión.</span></h2>
          <p className="mt-5 text-lg text-slate-400">Convierte tu celular en una cámara inalámbrica para tus producciones en OBS Studio.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Link href="/camera" className="group rounded-3xl border border-blue-500/30 bg-blue-950/40 p-7 transition hover:border-blue-400 hover:bg-blue-950/70">
            <Camera className="text-blue-400" size={30} />
            <p className="mt-5 text-xs font-bold uppercase tracking-widest text-blue-400">01 / TRANSMISOR</p>
            <h3 className="mt-2 text-2xl font-bold">StreamVerse Camera</h3>
            <p className="mt-3 text-slate-400">Abre la cámara trasera y transmite video y audio desde tu celular.</p>
            <div className="mt-8 font-semibold text-blue-300">Abrir cámara →</div>
          </Link>

          <Link href="/receiver" className="group rounded-3xl border border-white/10 bg-white/[.03] p-7 transition hover:border-blue-400">
            <Monitor className="text-blue-400" size={30} />
            <p className="mt-5 text-xs font-bold uppercase tracking-widest text-blue-400">02 / RECEPTOR</p>
            <h3 className="mt-2 text-2xl font-bold">StreamVerse Receiver</h3>
            <p className="mt-3 text-slate-400">Recibe la señal y úsala como fuente de navegador en OBS.</p>
            <div className="mt-8 font-semibold text-blue-300">Abrir receptor →</div>
          </Link>
        </div>

        <div className="mt-10 flex items-center gap-2 text-sm text-slate-500"><Radio size={16} /> WebRTC · Video y audio en tiempo real</div>
        <footer className="mt-16 border-t border-white/10 pt-6 text-sm text-slate-500">StreamVerse Camera System</footer>
      </div>
    </main>
  );
}
