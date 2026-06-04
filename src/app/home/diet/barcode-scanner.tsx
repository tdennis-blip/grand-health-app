"use client";

import { useEffect, useRef, useState } from "react";
import { X, Camera, Keyboard } from "lucide-react";

// Detects three runtimes, in order:
//   1. Capacitor native (iOS/Android): @capacitor-mlkit/barcode-scanning
//   2. Web with BarcodeDetector API (Chrome / recent Safari on iOS 17+)
//   3. Fallback: manual numeric entry
//
// Returns the scanned digits via onScanned(code). The host is responsible for
// looking up the code + closing the sheet.

declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean };
    BarcodeDetector?: any;
  }
}

type Props = {
  onScanned: (code: string) => void;
  onClose: () => void;
};

export function BarcodeScanner({ onScanned, onClose }: Props) {
  const [mode, setMode] = useState<"detecting" | "native" | "web" | "manual">("detecting");
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Decide which path on mount
  useEffect(() => {
    const isNative = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
    if (isNative) {
      runNativeScan();
      return;
    }
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      setMode("web");
      return;
    }
    setMode("manual");
    setError("Camera scanning not supported on this device. Enter the barcode manually.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runNativeScan() {
    setMode("native");
    try {
      // Dynamic import so web builds without Capacitor still bundle clean.
      // The package is in optionalDependencies; the variable indirection keeps
      // bundlers/tsc from resolving it during web builds.
      const moduleName = "@capacitor-mlkit/barcode-scanning";
      const mod: any = await (Function("m", "return import(m)") as any)(moduleName).catch(() => null);
      if (!mod?.BarcodeScanner) {
        setMode("manual");
        setError("Native scanner module not available.");
        return;
      }
      const Scanner = mod.BarcodeScanner;
      // Make sure permissions are granted
      const perm = await Scanner.requestPermissions();
      if (perm?.camera !== "granted") {
        setMode("manual");
        setError("Camera permission denied.");
        return;
      }
      const result = await Scanner.scan({
        formats: [
          "EAN_13",
          "EAN_8",
          "UPC_A",
          "UPC_E",
          "CODE_128",
        ],
      });
      const code = result?.barcodes?.[0]?.rawValue?.replace(/\D/g, "") ?? "";
      if (!code) {
        setMode("manual");
        setError("No barcode detected. Enter it manually.");
        return;
      }
      onScanned(code);
    } catch (e: any) {
      setMode("manual");
      setError(e?.message ?? "Scanner error.");
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/70 z-[60]" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[61] bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Camera size={15} /> Scan barcode
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {mode === "detecting" && (
            <div className="text-sm text-slate-500 text-center py-8">Initializing…</div>
          )}

          {mode === "native" && (
            <div className="text-sm text-slate-500 text-center py-8">
              Point your camera at the barcode.
            </div>
          )}

          {mode === "web" && (
            <WebScanner
              onScanned={onScanned}
              onFallback={(msg) => { setMode("manual"); setError(msg); }}
            />
          )}

          {mode === "manual" && (
            <div className="space-y-3">
              {error && (
                <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  {error}
                </div>
              )}
              <label className="block">
                <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1">
                  <Keyboard size={11} /> Barcode digits
                </span>
                <input
                  autoFocus
                  inputMode="numeric"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 028400090728"
                  className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 tabular-nums"
                />
              </label>
              <button
                onClick={() => {
                  if (manualCode.length < 6) return;
                  onScanned(manualCode);
                }}
                disabled={manualCode.length < 6}
                className="w-full text-sm font-semibold bg-teal-700 text-white px-4 py-2.5 rounded-lg hover:bg-teal-800 disabled:opacity-60"
              >
                Look up
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function WebScanner({
  onScanned,
  onFallback,
}: {
  onScanned: (code: string) => void;
  onFallback: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef(false);
  const [hint, setHint] = useState<string>("Hold the barcode steady in frame…");

  useEffect(() => {
    stopRef.current = false;
    let detector: any = null;

    const start = async () => {
      try {
        // BarcodeDetector is a Web API not in default TS lib; cast via any.
        const Ctor: any = (window as any).BarcodeDetector;
        detector = new Ctor({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
        });
      } catch (e: any) {
        onFallback("BarcodeDetector formats unsupported.");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (e: any) {
        onFallback(e?.name === "NotAllowedError" ? "Camera permission denied." : "Camera unavailable.");
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch { /* iOS autoplay quirks */ }
      }

      const loop = async () => {
        if (stopRef.current) return;
        const v = videoRef.current;
        if (!v || v.readyState < 2) {
          requestAnimationFrame(loop);
          return;
        }
        try {
          const codes = await detector.detect(v);
          if (codes && codes.length > 0) {
            const raw = String(codes[0].rawValue ?? "").replace(/\D/g, "");
            if (raw.length >= 6) {
              stopRef.current = true;
              cleanup();
              onScanned(raw);
              return;
            }
          }
        } catch {
          // Transient detector errors — keep looping.
        }
        setHint("Hold the barcode steady in frame…");
        setTimeout(() => requestAnimationFrame(loop), 120);
      };
      loop();
    };

    const cleanup = () => {
      stopRef.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    start();
    return cleanup;
  }, [onScanned, onFallback]);

  return (
    <div className="space-y-2">
      <div className="relative aspect-[4/3] bg-slate-900 rounded-xl overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-12 border-2 border-emerald-400/80 rounded-lg pointer-events-none" />
      </div>
      <div className="text-[11px] text-slate-500 text-center">{hint}</div>
    </div>
  );
}
