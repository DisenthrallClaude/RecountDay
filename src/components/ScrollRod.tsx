import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Builds the lathe-turned rod (轴) profile used for both ends of the
 * scroll. The finial is composed of a small long cylinder (outer tip)
 * plus a large short frustum (closer to the shaft), matching traditional
 * East Asian scroll hardware.
 */
export function useRodGeometry(paperHalfHeight: number) {
  return useMemo(() => {
    const shaftTop = paperHalfHeight + 0.045;
    const finialLen = 0.42; // total length of the finial section beyond the shaft

    // Radii
    const shaftR = 0.05;    // main shaft radius
    const smallR = 0.035;   // small long cylinder radius
    const largeR = 0.085;   // large short frustum max radius

    // Segment lengths
    const cylLen = 0.16;    // small long cylinder length
    const frustLen = 0.06;  // large short frustum length
    const transLen = 0.06;  // transition from frustum to shaft

    const points: THREE.Vector2[] = [
      // ---- Bottom finial (tip → shaft) ----
      new THREE.Vector2(0.0, -(shaftTop + finialLen)),                    // rounded tip
      new THREE.Vector2(smallR, -(shaftTop + finialLen - 0.015)),         // small cylinder start (slight round)
      new THREE.Vector2(smallR, -(shaftTop + finialLen - 0.015 - cylLen)),// small cylinder end (long)
      // large short frustum: widens from smallR to largeR
      new THREE.Vector2(largeR, -(shaftTop + finialLen - 0.015 - cylLen - frustLen)), // frustum wide end
      new THREE.Vector2(largeR, -(shaftTop + finialLen - 0.015 - cylLen - frustLen - 0.02)), // frustum wide plateau
      // transition narrowing from largeR back to shaftR
      new THREE.Vector2(shaftR + 0.005, -(shaftTop + transLen)),
      new THREE.Vector2(shaftR, -shaftTop),                               // shaft begins

      // ---- Straight shaft ----
      new THREE.Vector2(shaftR, shaftTop),                                // shaft ends

      // ---- Top finial (shaft → tip, mirrored) ----
      new THREE.Vector2(shaftR + 0.005, shaftTop + transLen),
      new THREE.Vector2(largeR, shaftTop + finialLen - 0.015 - cylLen - frustLen - 0.02),
      new THREE.Vector2(largeR, shaftTop + finialLen - 0.015 - cylLen - frustLen),
      new THREE.Vector2(smallR, shaftTop + finialLen - 0.015 - cylLen),
      new THREE.Vector2(smallR, shaftTop + finialLen - 0.015),
      new THREE.Vector2(0.0, shaftTop + finialLen),                       // rounded tip
    ];
    const geo = new THREE.LatheGeometry(points, 48);
    geo.computeVertexNormals();
    return geo;
  }, [paperHalfHeight]);
}

export function useShaftLength(paperHalfHeight: number) {
  return paperHalfHeight * 2 + 0.09;
}
