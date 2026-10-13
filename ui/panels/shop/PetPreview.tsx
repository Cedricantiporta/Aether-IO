import React from 'react';
import { Canvas } from '@react-three/fiber';
import { PetModel } from '../../../render/Pet';

/** Small standalone canvas showing one pet on a pedestal. Mounted only while the Pets panel is open. */
const PetPreview: React.FC<{ id: string }> = ({ id }) => (
  <Canvas dpr={[1, 1.5]} shadows={false} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} camera={{ position: [0, 1.5, 3.6], fov: 35 }}
    onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)} style={{ width: '100%', height: '100%' }}>
    <ambientLight intensity={1.4} />
    <directionalLight position={[3, 5, 4]} intensity={2.2} />
    <pointLight position={[-3, 1, -2]} intensity={8} color="#9fb8ff" />
    <mesh position={[0, -0.05, 0]}><cylinderGeometry args={[1.0, 1.15, 0.2, 24]} /><meshStandardMaterial color="#5a5148" roughness={0.9} /></mesh>
    <mesh position={[0, 0.06, 0]}><cylinderGeometry args={[0.95, 0.95, 0.02, 24]} /><meshStandardMaterial color="#8a7a5a" roughness={0.8} /></mesh>
    <group position={[0, 0.1, 0]}><PetModel id={id} /></group>
  </Canvas>
);
export default PetPreview;
