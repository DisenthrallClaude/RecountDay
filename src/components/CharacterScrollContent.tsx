import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { CharacterDef } from '../data/characters';

/* ──────────────────────────────────────────────
   3D component: character portrait + calligraphy
   text rendered ON the parchment surface via
   CanvasTexture. Text is vertical, white, and
   progressively "written" with a brush effect.

   Layout (left → right):
     [Name] [col1 col2 col3] [Portrait] [col1 col2 col3 col4]
   Name is at the far left edge.
   Left text = 3 columns from quote (4-5 chars each).
   Right text = 4 columns from desc (4-5 chars each).
   ────────────────────────────────────────────── */

const PORTRAIT_W = 0.72;
const PORTRAIT_H = 1.08;

const FONT_FAMILY = '"Liu Jian Mao Cao", "Ma Shan Zheng", "Long Cang", serif';

/** Split text into N columns of ~charsPerCol characters each */
function splitIntoColumns(text: string, numCols: number, charsPerCol: number): string[] {
  // Remove punctuation that would break columns
  const clean = text.replace(/[，。、！？；：""''《》【】（）\s]/g, '');
  const cols: string[] = [];
  for (let i = 0; i < numCols; i++) {
    const start = i * charsPerCol;
    const end = start + charsPerCol;
    cols.push(clean.slice(start, end));
  }
  return cols.filter((c) => c.length > 0);
}

/** Create a canvas + texture for vertical text rendering */
function useVerticalTextTexture(canvasW: number, canvasH: number) {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = canvasW;
    c.height = canvasH;
    return c;
  }, [canvasW, canvasH]);

  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);

  return { canvas, texture };
}

/** Render vertical text columns on a canvas */
function renderColumns(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  columns: string[],
  fontSize: number,
  color: string,
  shadowColor: string,
  shadowBlur: number,
  revealProgress: number // 0..1, how much of total text is revealed
) {
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;

  const totalChars = columns.reduce((sum, col) => sum + col.length, 0);
  const revealedCount = revealProgress * totalChars;
  let charIndex = 0;

  const numCols = columns.length;
  const colWidth = canvasW / (numCols + 1);

  for (let colIdx = 0; colIdx < numCols; colIdx++) {
    const col = columns[colIdx];
    // Right-to-left column ordering (traditional Chinese)
    const x = colWidth * (numCols - colIdx);
    const charSpacing = canvasH / (col.length + 1);

    for (let rowIdx = 0; rowIdx < col.length; rowIdx++) {
      const charProgress = Math.min(1, Math.max(0, revealedCount - charIndex));
      if (charProgress > 0) {
        const ease = 1 - Math.pow(1 - charProgress, 2);
        const y = charSpacing * (rowIdx + 1);
        ctx.globalAlpha = ease;
        const blurAmount = (1 - charProgress) * 12;
        ctx.shadowBlur = shadowBlur + blurAmount;
        ctx.fillText(col[rowIdx], x, y);
      }
      charIndex++;
    }
  }
  ctx.globalAlpha = 1;
}

interface CharacterScrollContentProps {
  character: CharacterDef;
  progress: number;
}

export default function CharacterScrollContent({ character, progress }: CharacterScrollContentProps) {
  const portraitTex = useTexture(character.portrait);

  useEffect(() => {
    if (portraitTex) {
      portraitTex.colorSpace = THREE.SRGBColorSpace;
    }
  }, [portraitTex]);

  // ── Refs ──
  const portraitRef = useRef<THREE.Mesh>(null!);
  const borderRef = useRef<THREE.Mesh>(null!);
  const nameMatRef = useRef<THREE.MeshBasicMaterial>(null!);
  const leftMatRef = useRef<THREE.MeshBasicMaterial>(null!);
  const rightMatRef = useRef<THREE.MeshBasicMaterial>(null!);
  const startTime = useRef<number>(0);
  const started = useRef(false);

  // ── Text data ──
  const nameChars = character.name.split('');
  // Left: 3 columns from quote, 5 chars each
  const leftColumns = useMemo(() => splitIntoColumns(character.quote, 3, 5), [character.quote]);
  // Right: 4 columns from desc, 5 chars each
  const rightColumns = useMemo(() => splitIntoColumns(character.desc, 4, 5), [character.desc]);

  // ── Canvas dimensions ──
  const NAME_CANVAS_W = 128;
  const NAME_CANVAS_H = 512;
  const LEFT_CANVAS_W = 384;  // 3 columns
  const LEFT_CANVAS_H = 512;
  const RIGHT_CANVAS_W = 512; // 4 columns
  const RIGHT_CANVAS_H = 512;

  const { canvas: nameCanvas, texture: nameTexture } = useVerticalTextTexture(NAME_CANVAS_W, NAME_CANVAS_H);
  const { canvas: leftCanvas, texture: leftTexture } = useVerticalTextTexture(LEFT_CANVAS_W, LEFT_CANVAS_H);
  const { canvas: rightCanvas, texture: rightTexture } = useVerticalTextTexture(RIGHT_CANVAS_W, RIGHT_CANVAS_H);

  // ── Pre-render full text ──
  useEffect(() => {
    // Name canvas: vertical, large white, NO bold
    const nctx = nameCanvas.getContext('2d')!;
    nctx.clearRect(0, 0, NAME_CANVAS_W, NAME_CANVAS_H);
    nctx.font = `80px ${FONT_FAMILY}`;
    nctx.fillStyle = '#ffffff';
    nctx.textAlign = 'center';
    nctx.textBaseline = 'middle';
    nctx.shadowColor = 'rgba(255,255,255,0.6)';
    nctx.shadowBlur = 12;
    const charSpacing = NAME_CANVAS_H / (nameChars.length + 1);
    nameChars.forEach((ch, i) => {
      nctx.fillText(ch, NAME_CANVAS_W / 2, charSpacing * (i + 1));
    });
    nameTexture.needsUpdate = true;

    // Left & right canvases: pre-render full text (animation will re-render progressively)
    const lctx = leftCanvas.getContext('2d')!;
    renderColumns(lctx, LEFT_CANVAS_W, LEFT_CANVAS_H, leftColumns, 40, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.4)', 6, 1);
    leftTexture.needsUpdate = true;

    const rctx = rightCanvas.getContext('2d')!;
    renderColumns(rctx, RIGHT_CANVAS_W, RIGHT_CANVAS_H, rightColumns, 40, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.4)', 6, 1);
    rightTexture.needsUpdate = true;
  }, [character, nameCanvas, leftCanvas, rightCanvas, nameTexture, leftTexture, rightTexture, nameChars, leftColumns, rightColumns]);

  // ── Animation ──
  useFrame((state) => {
    if (progress > 0.88 && !started.current) {
      started.current = true;
      startTime.current = state.clock.elapsedTime;
    }

    const elapsed = started.current ? state.clock.elapsedTime - startTime.current : 0;

    // Portrait: fades in 0 → 0.8s
    const pProgress = Math.min(1, Math.max(0, elapsed / 0.8));
    const pEase = 1 - Math.pow(1 - pProgress, 3);

    if (borderRef.current) {
      const mat = borderRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = pEase * 0.85;
      borderRef.current.scale.set(0.88 + 0.12 * pEase, 0.88 + 0.12 * pEase, 1);
    }
    if (portraitRef.current) {
      const mat = portraitRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = pEase;
      portraitRef.current.scale.set(0.88 + 0.12 * pEase, 0.88 + 0.12 * pEase, 1);
    }

    // ── Calligraphy writing timeline ──
    // Phase 1: Name (0.5s → nameChars * 0.3s)
    const nameStart = 0.5;
    const nameCharDur = 0.3;
    const nameTotalDur = nameChars.length * nameCharDur;
    const nameProgress = Math.min(1, Math.max(0, (elapsed - nameStart) / nameTotalDur));

    // Phase 2: Left text (after name)
    const leftStart = nameStart + nameTotalDur + 0.2;
    const leftCharDur = 0.06;
    const leftTotalChars = leftColumns.reduce((s, c) => s + c.length, 0);
    const leftTotalDur = leftTotalChars * leftCharDur;
    const leftProgress = Math.min(1, Math.max(0, (elapsed - leftStart) / leftTotalDur));

    // Phase 3: Right text (after left)
    const rightStart = leftStart + leftTotalDur + 0.2;
    const rightCharDur = 0.06;
    const rightTotalChars = rightColumns.reduce((s, c) => s + c.length, 0);
    const rightTotalDur = rightTotalChars * rightCharDur;
    const rightProgress = Math.min(1, Math.max(0, (elapsed - rightStart) / rightTotalDur));

    // ── Redraw name canvas with progressive reveal ──
    if (elapsed >= nameStart && nameProgress < 1) {
      const nctx = nameCanvas.getContext('2d')!;
      nctx.clearRect(0, 0, NAME_CANVAS_W, NAME_CANVAS_H);
      nctx.font = `80px ${FONT_FAMILY}`;
      nctx.fillStyle = '#ffffff';
      nctx.textAlign = 'center';
      nctx.textBaseline = 'middle';
      nctx.shadowColor = 'rgba(255,255,255,0.6)';
      nctx.shadowBlur = 12;
      const charSpacing = NAME_CANVAS_H / (nameChars.length + 1);
      const revealedCount = nameProgress * nameChars.length;
      nameChars.forEach((ch, i) => {
        const charProgress = Math.min(1, Math.max(0, revealedCount - i));
        if (charProgress <= 0) return;
        const ease = 1 - Math.pow(1 - charProgress, 2);
        nctx.globalAlpha = ease;
        nctx.shadowBlur = 12 + (1 - charProgress) * 15;
        nctx.fillText(ch, NAME_CANVAS_W / 2, charSpacing * (i + 1));
      });
      nctx.globalAlpha = 1;
      nameTexture.needsUpdate = true;
    }

    // ── Redraw left canvas with progressive reveal ──
    if (elapsed >= leftStart && leftProgress < 1) {
      const lctx = leftCanvas.getContext('2d')!;
      renderColumns(lctx, LEFT_CANVAS_W, LEFT_CANVAS_H, leftColumns, 40, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.4)', 6, leftProgress);
      leftTexture.needsUpdate = true;
    }

    // ── Redraw right canvas with progressive reveal ──
    if (elapsed >= rightStart && rightProgress < 1) {
      const rctx = rightCanvas.getContext('2d')!;
      renderColumns(rctx, RIGHT_CANVAS_W, RIGHT_CANVAS_H, rightColumns, 40, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.4)', 6, rightProgress);
      rightTexture.needsUpdate = true;
    }

    // ── Fade in text planes ──
    if (nameMatRef.current) {
      nameMatRef.current.opacity = Math.min(1, Math.max(0, (elapsed - nameStart) / 0.4));
    }
    if (leftMatRef.current) {
      leftMatRef.current.opacity = Math.min(1, Math.max(0, (elapsed - leftStart) / 0.4));
    }
    if (rightMatRef.current) {
      rightMatRef.current.opacity = Math.min(1, Math.max(0, (elapsed - rightStart) / 0.4));
    }
  });

  // ── Layout ──
  // Scroll paper: L=3.4 x H=1.5, centered at origin
  // Content group at y=0.85, z=0.018
  //
  // Available width: ~3.0 (minus rod areas)
  // Layout left → right:
  //   Name (0.22) | gap | Left3cols (0.66) | gap | Portrait (0.72) | gap | Right4cols (0.80)
  //
  // Total: 0.22 + 0.04 + 0.66 + 0.04 + 0.72 + 0.04 + 0.80 = 2.52  ✓ fits in 3.0

  const namePlaneW = 0.22;
  const namePlaneH = 0.88;
  const leftPlaneW = 0.66;
  const leftPlaneH = 0.88;
  const rightPlaneW = 0.80;
  const rightPlaneH = 0.88;
  const gap = 0.04;

  // Calculate X positions from left to right
  const leftEdge = -1.26; // start from left
  const nameX = leftEdge + namePlaneW / 2;
  const leftX = nameX + namePlaneW / 2 + gap + leftPlaneW / 2;
  const portraitX = leftX + leftPlaneW / 2 + gap + PORTRAIT_W / 2;
  const rightX = portraitX + PORTRAIT_W / 2 + gap + rightPlaneW / 2;

  return (
    <group position={[0, 0.85, 0.08]}>
      {/* Portrait decorative border (depthWrite=false so it never occludes text) */}
      <mesh ref={borderRef} position={[portraitX, 0.0, -0.005]} renderOrder={10}>
        <planeGeometry args={[PORTRAIT_W + 0.06, PORTRAIT_H + 0.06]} />
        <meshBasicMaterial color="#3a2814" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Portrait image (depthWrite=false prevents transparent portrait from writing depth and occluding text behind it) */}
      <mesh ref={portraitRef} position={[portraitX, 0.0, 0]} renderOrder={11}>
        <planeGeometry args={[PORTRAIT_W, PORTRAIT_H]} />
        <meshBasicMaterial map={portraitTex} transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Vertical name text — far left edge. z-pushed forward and high renderOrder to stay visible at any angle */}
      <mesh position={[nameX, 0.0, 0.02]} renderOrder={999}>
        <planeGeometry args={[namePlaneW, namePlaneH]} />
        <meshBasicMaterial ref={nameMatRef} map={nameTexture} transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Left text: 3 columns (from quote) */}
      <mesh position={[leftX, 0.0, 0.02]} renderOrder={999}>
        <planeGeometry args={[leftPlaneW, leftPlaneH]} />
        <meshBasicMaterial ref={leftMatRef} map={leftTexture} transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Right text: 4 columns (from desc) */}
      <mesh position={[rightX, 0.0, 0.02]} renderOrder={999}>
        <planeGeometry args={[rightPlaneW, rightPlaneH]} />
        <meshBasicMaterial ref={rightMatRef} map={rightTexture} transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
