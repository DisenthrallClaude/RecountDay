import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { assetUrl } from "../utils/assetUrl";

export function Floor() {
  const tex = useTexture(assetUrl("textures/floor.jpg"));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.15, 0]} receiveShadow>
      <planeGeometry args={[30, 30]} />
      <meshStandardMaterial map={tex} roughness={0.95} metalness={0.05} />
    </mesh>
  );
}

export function Backdrop() {
  const tex = useTexture(assetUrl("images/background.jpg"));
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh position={[0, 2.3, -7]}>
      <planeGeometry args={[22, 13]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

export function Torchlight({ position }: { position: [number, number, number] }) {
  const light = useRef<THREE.PointLight>(null!);
  useFrame((state) => {
    if (!light.current) return;
    const flicker =
      1 + Math.sin(state.clock.elapsedTime * 9 + position[0]) * 0.08 +
      Math.sin(state.clock.elapsedTime * 23 + position[1]) * 0.05;
    light.current.intensity = 5.5 * flicker;
  });
  return <pointLight ref={light} position={position} color={'#ff8a3d'} distance={7} decay={2} />;
}
