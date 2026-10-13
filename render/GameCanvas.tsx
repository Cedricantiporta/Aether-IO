import React from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { Scene } from './Scene';
import { useQuality } from './quality';

export const GameCanvas: React.FC = () => {
  const q = useQuality();
  return (
    <Canvas
      key={q.name}
      shadows={q.shadowMap > 0 ? 'soft' : false}
      dpr={q.dpr}
      camera={{ position: [0, 32, 22], fov: 40, near: 0.5, far: 420 }}
      gl={{ antialias: q.name !== 'LOW', powerPreference: 'high-performance', stencil: false, alpha: false }}
      onCreated={({ gl }) => { gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.1; gl.outputColorSpace = SRGBColorSpace; }}
    >
      <Scene />
      {q.bloom && (
        <EffectComposer multisampling={q.msaa} enableNormalPass={false}>
          <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.2} intensity={0.65} radius={0.7} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.3} darkness={0.5} eskil={false} />
          {q.smaa && <SMAA />}
        </EffectComposer>
      )}
    </Canvas>
  );
};
