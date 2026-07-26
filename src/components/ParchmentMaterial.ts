import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';

// Custom shader material for the scroll's paper surface.
// - Reveals only the "unrolled" portion of the paper based on uProgress
// - Adds subtle cloth-like wrinkle shading near the roll edges
// - Simple hand-rolled lighting (ambient + directional) so we can fully
//   control the look of the cloth/parchment without relying on scene PBR

export const ParchmentMaterial = shaderMaterial(
  {
    uMap: null as unknown as THREE.Texture,
    uProgress: 1,
    uEdge: 0.045,
    uLightDir: new THREE.Vector3(0.4, 0.85, 0.6).normalize(),
    uTime: 0,
    uColorTint: new THREE.Color('#ffffff'),
  },
  /* glsl vertex */ `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying float vWrinkle;
    uniform float uTime;
    uniform float uProgress;

    void main() {
      vUv = uv;
      vec3 pos = position;

      // subtle cloth wrinkle undulation across the sheet
      float wrinkle = sin(pos.x * 9.0 + uTime * 0.15) * 0.006
                    + sin(pos.y * 14.0 + pos.x * 3.0) * 0.004
                    + sin((pos.x + pos.y) * 22.0) * 0.0018;
      pos.z += wrinkle;
      vWrinkle = wrinkle;

      vec3 n = normalize(normalMatrix * normal);
      vNormalW = n;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  /* glsl fragment */ `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying float vWrinkle;

    uniform sampler2D uMap;
    uniform float uProgress;
    uniform float uEdge;
    uniform vec3 uLightDir;
    uniform vec3 uColorTint;

    void main() {
      float half_width = uProgress * 0.5;
      float dist = abs(vUv.x - 0.5);

      // discard the still-rolled portion of the sheet
      if (dist > half_width) discard;

      vec4 tex = texture2D(uMap, vUv);

      // basic lambert lighting (brightened for visibility)
      float diff = clamp(dot(normalize(vNormalW), normalize(uLightDir)), 0.0, 1.0);
      float lighting = 1.15 + diff * 1.1;

      // darken near the rolled edge to fake self-shadowing where paper curls away
      float edgeFade = smoothstep(half_width, half_width - uEdge * 3.0, dist);
      float curlShadow = mix(0.85, 1.0, edgeFade);

      // subtle wrinkle based shading boost
      float wrinkleShade = 1.0 + vWrinkle * 8.0;

      vec3 color = tex.rgb * uColorTint * lighting * curlShadow * wrinkleShade;

      // soft alpha fade right at the cut edge to avoid a hard aliased line
      float alpha = smoothstep(half_width, half_width - 0.01, dist);

      gl_FragColor = vec4(color, alpha);
    }
  `
);

extend({ ParchmentMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    parchmentMaterial: any;
  }
}
