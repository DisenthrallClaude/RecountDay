import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useRodGeometry } from './ScrollRod';
import './ParchmentMaterial';
import { assetUrl } from "../utils/assetUrl";

const L = 3.4; // total unrolled paper length (shortened)
const H = 1.5; // paper height
const HALF_H = H / 2;
const BASE_RADIUS = 0.062;
const MAX_ROLL_EXTRA = 0.36;
const MIN_X = 0.16; // smallest half-gap between rods when fully closed

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

interface ScrollProps {
  openTarget: 0 | 1;
  onProgress: (p: number) => void;
}

export default function ScrollScene({ openTarget, onProgress }: ScrollProps) {
  const { camera, gl } = useThree();

  const [parchmentTex, goldTex] = useTexture([
    assetUrl("textures/parchment.jpg"),
    assetUrl("textures/gold_cap.jpg"),
  ]);

  useMemo(() => {
    parchmentTex.colorSpace = THREE.SRGBColorSpace;
    parchmentTex.wrapS = THREE.ClampToEdgeWrapping;
    parchmentTex.wrapT = THREE.ClampToEdgeWrapping;
    goldTex.wrapS = goldTex.wrapT = THREE.RepeatWrapping;
    goldTex.repeat.set(2, 2);
    goldTex.colorSpace = THREE.SRGBColorSpace;
  }, [parchmentTex, goldTex]);

  const rodGeo = useRodGeometry(HALF_H);

  const progressRef = useRef<number>(openTarget);
  const targetRef = useRef<number>(openTarget);
  const draggingRef = useRef<false | 'left' | 'right'>(false);
  const dragStartWorldX = useRef(0);
  const dragStartProgress = useRef(0);

  useEffect(() => {
    if (!draggingRef.current) targetRef.current = openTarget;
  }, [openTarget]);

  const leftGroup = useRef<THREE.Group>(null!);
  const rightGroup = useRef<THREE.Group>(null!);
  const leftRoll = useRef<THREE.Mesh>(null!);
  const rightRoll = useRef<THREE.Mesh>(null!);
  const paperMat = useRef<any>(null!);
  const paperMesh = useRef<THREE.Mesh>(null!);

  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  function pointerWorldX(clientX: number, clientY: number) {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    );
    raycaster.setFromCamera(ndc, camera);
    const pt = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, pt);
    return pt.x;
  }

  function onWindowMove(e: PointerEvent) {
    if (!draggingRef.current) return;
    const x = pointerWorldX(e.clientX, e.clientY);
    const deltaWorld = x - dragStartWorldX.current;
    const sign = draggingRef.current === 'right' ? 1 : -1;
    const deltaProgress = (sign * deltaWorld) / (L / 2 - MIN_X);
    const next = clamp(dragStartProgress.current + deltaProgress, 0, 1);
    progressRef.current = next;
    targetRef.current = next;
  }

  function onWindowUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    targetRef.current = progressRef.current > 0.5 ? 1 : 0;
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onWindowUp);
  }

  function startDrag(side: 'left' | 'right') {
    return (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      draggingRef.current = side;
      dragStartWorldX.current = pointerWorldX(e.nativeEvent.clientX, e.nativeEvent.clientY);
      dragStartProgress.current = progressRef.current;
      window.addEventListener('pointermove', onWindowMove);
      window.addEventListener('pointerup', onWindowUp);
    };
  }

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastReported = useRef(-1);

  useFrame((state, delta) => {
    if (!draggingRef.current) {
      const diff = targetRef.current - progressRef.current;
      if (Math.abs(diff) < 0.0008) {
        progressRef.current = targetRef.current;
      } else {
        progressRef.current += diff * Math.min(1, delta * 4.2);
      }
    }
    const p = progressRef.current;
    const reported = Math.round(p * 200);
    if (reported !== lastReported.current) {
      lastReported.current = reported;
      onProgress(p);
    }

    const halfGap = MIN_X + p * (L / 2 - MIN_X);
    leftGroup.current.position.x = -halfGap;
    rightGroup.current.position.x = halfGap;

    const rollRadius = BASE_RADIUS + (1 - p) * MAX_ROLL_EXTRA;
    leftRoll.current.scale.set(rollRadius / BASE_RADIUS, 1, rollRadius / BASE_RADIUS);
    rightRoll.current.scale.set(rollRadius / BASE_RADIUS, 1, rollRadius / BASE_RADIUS);
    leftRoll.current.visible = p < 0.995;
    rightRoll.current.visible = p < 0.995;

    if (paperMat.current) {
      paperMat.current.uProgress = Math.max(p, 0.001);
      paperMat.current.uTime = state.clock.elapsedTime;
      // Ensure transparent parchment doesn't write depth (prevents text/portrait z-fighting at angled views)
      if (paperMat.current.depthWrite !== false) paperMat.current.depthWrite = false;
    }
    paperMesh.current.scale.x = 1;
  });

  const goldMaterial = (
    <meshStandardMaterial map={goldTex} metalness={0.85} roughness={0.32} color={'#d9b26a'} />
  );

  return (
    <group position={[0, 0.8, 0]}>
      {/* Flat, unrolled paper sheet */}
      <mesh ref={paperMesh} position={[0, 0, 0]} castShadow receiveShadow renderOrder={5}>
        <planeGeometry args={[L, H, 220, 40]} />
        {/* @ts-ignore */}
        <parchmentMaterial
          ref={paperMat}
          uMap={parchmentTex}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* LEFT ROD */}
      <group ref={leftGroup}>
        <mesh
          geometry={rodGeo}
          castShadow
          receiveShadow
          onPointerDown={startDrag('left')}
        >
          {goldMaterial}
        </mesh>
        <mesh ref={leftRoll} position={[0, 0, 0]}>
          <cylinderGeometry args={[BASE_RADIUS, BASE_RADIUS, H - 0.02, 40, 1, true]} />
          <meshStandardMaterial
            map={parchmentTex}
            roughness={0.9}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* RIGHT ROD */}
      <group ref={rightGroup}>
        <mesh
          geometry={rodGeo}
          castShadow
          receiveShadow
          onPointerDown={startDrag('right')}
        >
          {goldMaterial}
        </mesh>
        <mesh ref={rightRoll} position={[0, 0, 0]}>
          <cylinderGeometry args={[BASE_RADIUS, BASE_RADIUS, H - 0.02, 40, 1, true]} />
          <meshStandardMaterial
            map={parchmentTex}
            roughness={0.9}
            metalness={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}
