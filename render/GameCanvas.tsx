import React, { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, SMAA, ToneMapping, TiltShift2 } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { Scene } from './Scene';
import { QualityCfg, adaptive, setAdaptiveLevel, useQuality } from './quality';
import { perf } from './perf';
import { FX } from './fx';
import { useGameStore } from '../store';
import { classifyGpu, device } from '../engine/device';

/**
 * Owns the render loop (Canvas runs frameloop="never"): applies the FPS cap, measures frame time and,
 * when "Auto quality" is on, lowers / raises resolution scale + particle budget on sustained drops / stable frames.
 */
function FrameDriver({ q }: { q: QualityCfg }) {
  const advance = useThree((s) => s.advance);
  const setDpr = useThree((s) => s.setDpr);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    // GPU tier (phones with a weak GPU start on LOW once)
    try {
      const ctx = gl.getContext();
      const ext = ctx.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      const low = classifyGpu(name);
      const st = useGameStore.getState();
      if (low && device.phone && st.settings.autoQuality && st.settings.quality !== 'LOW' && !localStorage.getItem('aether-gpu-checked')) {
        localStorage.setItem('aether-gpu-checked', '1');
        st.updateSettings({ quality: 'LOW' });
      }
    } catch { /* ignore */ }
  }, [gl]);

  useEffect(() => {
    let raf = 0, last = 0, winStart = 0, frames = 0, jsAcc = 0, bad = 0, good = 0;
    setAdaptiveLevel(0);
    const apply = () => {
      const st = useGameStore.getState().settings;
      const mul = st.autoQuality ? adaptive.dprMul : 1;
      const dpr = Math.max(0.5, q.dpr * mul);
      setDpr(dpr); perf.dpr = dpr; perf.level = st.autoQuality ? adaptive.level : 0;
      FX.scale = q.fxScale * (st.autoQuality ? adaptive.fxMul : 1);
    };
    apply();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const st = useGameStore.getState().settings;
      const cap = st.batterySaver ? 30 : st.fpsLimit;
      const iv = cap ? 1000 / cap : 0;
      if (iv && t - last < iv - 2) return;
      if (!last) winStart = t;
      const dtMs = t - last;
      last = iv ? t - ((t - last) % iv) : t;
      const t0 = performance.now();
      advance(t / 1000);
      jsAcc += performance.now() - t0;
      frames++;
      perf.frameMs = perf.frameMs * 0.9 + dtMs * 0.1;
      const info = gl.info.render;
      perf.calls = info.calls; perf.tris = info.triangles;
      if (t - winStart >= 2000) {
        const fps = (frames * 1000) / (t - winStart);
        perf.fps = fps; perf.jsMs = jsAcc / frames;
        const target = cap || 60;
        const playing = useGameStore.getState().status === 'PLAYING';
        if (st.autoQuality && playing) {
          if (fps < target * 0.82) { bad++; good = 0; } else if (fps > target * 0.95) { good++; bad = 0; } else { bad = 0; good = 0; }
          if (bad >= 2 && adaptive.level < 3) { setAdaptiveLevel(adaptive.level + 1); bad = 0; apply(); }
          else if (good >= 4 && adaptive.level > 0) { setAdaptiveLevel(adaptive.level - 1); good = 0; apply(); }
        }
        frames = 0; jsAcc = 0; winStart = t;
      }
    };
    raf = requestAnimationFrame(loop);
    const unsub = useGameStore.subscribe((s, p) => { if (s.settings.autoQuality !== p.settings.autoQuality) { if (!s.settings.autoQuality) setAdaptiveLevel(0); apply(); } });
    return () => { cancelAnimationFrame(raf); unsub(); };
  }, [advance, setDpr, gl, q]);
  return null;
}

export const GameCanvas: React.FC = () => {
  const q = useQuality();
  const tilt = useGameStore((s) => s.settings?.tiltShift !== false);   // (diorama look; drawn in the composer, so only on quality tiers with bloom)
  return (
    <Canvas
      key={q.name}
      frameloop="never"
      shadows={q.shadowMap > 0 ? 'soft' : false}
      dpr={q.dpr}
      camera={{ position: [0, 32, 22], fov: 40, near: 0.5, far: 420 }}
      gl={{ antialias: q.name !== 'LOW', powerPreference: 'high-performance', stencil: false, alpha: false }}
      style={{ touchAction: 'none' }}
      onCreated={({ gl }) => { gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.1; gl.outputColorSpace = SRGBColorSpace; }}
    >
      <FrameDriver q={q} />
      <Scene />
      {q.bloom && (
        <EffectComposer multisampling={q.msaa} enableNormalPass={false}>
          <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.2} intensity={0.65} radius={0.7} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          {tilt && <TiltShift2 blur={0.18} taper={0.55} start={[0, 0.5]} end={[1, 0.5]} samples={8} />}
          <Vignette offset={0.3} darkness={0.5} eskil={false} />
          {q.smaa && <SMAA />}
        </EffectComposer>
      )}
    </Canvas>
  );
};
