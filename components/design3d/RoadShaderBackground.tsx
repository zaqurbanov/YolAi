'use client';

import { useEffect, useRef } from 'react';
import { reportClientError } from '@/app/actions/reportClientError';

// Raw WebGL (no three.js/library) perspective-road shader, ported as-is from
// the Stitch "Shader" export (scratchpad/stitch-3d/shader/code.html,
// ANIMATION_26) for the Cyber-Circuit Legal home page hero background —
// vertex/fragment GLSL source is copied verbatim (creative content —
// road/car-light colors, motion — unchanged), only the React lifecycle
// wiring (mount/resize/cleanup) is new.
const VERTEX_SHADER = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
varying vec2 v_texCoord;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
    vec2 uv = v_texCoord;
    vec3 color = vec3(0.02, 0.04, 0.06); // Dərin kiber-gecə fonu

    // Yol mərkəzi
    float roadWidth = 0.4;
    float distToCenter = abs(uv.x - 0.5);

    if (distToCenter < roadWidth) {
        float perspective = pow(uv.y, 2.0);
        // Slowed down (was * 2.5) — a calmer, more distant-feeling drift
        // rather than a fast highway pass.
        float speed = u_time * 0.9;

        // Asfalt parıltısı (sarı neon vurğularla)
        color += vec3(0.1, 0.08, 0.0) * (1.0 - distToCenter/roadWidth);

        // Kənar neon sarı xətlər
        float edge = smoothstep(0.015, 0.0, abs(distToCenter - roadWidth * 0.98));
        color += vec3(1.0, 0.84, 0.0) * edge * perspective;

        // Mərkəzi kəsik xətt (Neon Sarı) — dimmed (was * 1.5) so it reads as
        // a background element, not a foreground focal point.
        float dash = step(0.5, fract(uv.y * 15.0 - speed));
        if (distToCenter < 0.006 && dash > 0.0) {
            color += vec3(1.0, 0.9, 0.0) * perspective * 0.9;
        }

        // Maşınların İşıq İzləri — slowed (was * 0.15) and dimmed (was * 2.0)
        // for the same "distant, receded" feel.
        for(int i = 0; i < 8; i++) {
            float seed = float(i) * 45.67;
            float lane = (hash(vec2(seed, 1.0)) > 0.5) ? 0.18 : -0.18;
            float carSpeed = 0.5 + hash(vec2(seed, 2.0)) * 2.0;
            float carPos = fract(hash(vec2(seed, 3.0)) + u_time * 0.06 * carSpeed);

            vec2 carCoord = vec2(0.5 + lane, carPos);
            float distToCar = length(uv - carCoord);

            // Maşın faraları (Sarımtıl ağ və ya Qırmızı)
            if (distToCar < 0.06 * uv.y) {
                vec3 lightColor = (lane > 0.0) ? vec3(1.0, 0.2, 0.1) : vec3(1.0, 0.95, 0.7);
                float intensity = exp(-distToCar * 50.0 / uv.y);
                color += lightColor * intensity * perspective * 1.1;
            }
        }
    }

    // Atmosfer dumanı və vignette — stronger fog (was pow 1.5) pushes the
    // whole scene further back visually, like it's being viewed from afar.
    color *= pow(uv.y, 2.2);
    color += vec3(0.05, 0.04, 0.0) * (1.0 - length(uv - 0.5));

    gl_FragColor = vec4(color, 1.0);
}`;

// GLSL compilation/linking can fail silently in production — a shader/program
// that fails to compile or link just draws nothing (transparent canvas), with
// no thrown JS exception to catch. Both steps are checked explicitly and any
// failure is both logged to the console AND reported via reportClientError
// (context `design3d.roadShader.compileError`/`design3d.roadShader.linkError`)
// — same "client failures must always leave a trace" rule ChatClient.tsx
// follows for its own client-side error paths.
function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown shader compile error';
    const kind = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
    console.error(`[RoadShaderBackground] ${kind} shader compile error:`, log);
    void reportClientError({
      context: 'design3d.roadShader.compileError',
      message: log,
      details: { shaderType: kind },
    });
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

interface RoadShaderBackgroundProps {
  className?: string;
}

// Fills its positioned ancestor (use with a `relative` wrapper + this at
// `absolute inset-0`) with the animated perspective-road shader. Renders a
// static gradient instead of starting the WebGL/rAF loop at all when
// `prefers-reduced-motion: reduce` is set — same matchMedia check used by
// components/AnimatedNumber.tsx elsewhere in this app. Only ever mounted by
// components/design3d/HomePage3D.tsx, so this has no effect on "sadə
// dizayn" or any other page.
export default function RoadShaderBackground({ className }: RoadShaderBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // No WebGL context is created at all — nothing to animate or clean up.
      return;
    }

    function syncSize() {
      if (!canvas) return;
      const w = canvas.clientWidth || 1280;
      const h = canvas.clientHeight || 720;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(syncSize);
      resizeObserver.observe(canvas);
    }
    syncSize();

    const gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) {
      resizeObserver?.disconnect();
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      resizeObserver?.disconnect();
      return;
    }

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) {
      // Already logged/reported inside compileShader — nothing more to draw.
      resizeObserver?.disconnect();
      return;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'unknown program link error';
      console.error('[RoadShaderBackground] program link error:', log);
      void reportClientError({
        context: 'design3d.roadShader.linkError',
        message: log,
      });
      resizeObserver?.disconnect();
      return;
    }

    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, 'u_time');
    const uRes = gl.getUniformLocation(program, 'u_resolution');

    let rafId: number;
    let cancelled = false;

    function render(t: number) {
      if (cancelled || !gl || !canvas) return;
      if (typeof ResizeObserver === 'undefined') syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafId = requestAnimationFrame(render);
    }
    rafId = requestAnimationFrame(render);

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      // Deliberately NOT calling WEBGL_lose_context here. React 19 dev mode
      // (StrictMode) mounts every effect, cleans it up, then mounts it again
      // immediately as a bug-detection measure — explicitly killing the
      // context on that first, throwaway cleanup left the canvas permanently
      // dead for the second (real) mount: getContext('webgl') on the same
      // <canvas> node returns the same lost context rather than a fresh one,
      // so every shader "compiled" against it fails with an empty info log
      // (surfaced as "unknown shader compile error"). The canvas element
      // itself (and its GPU context) is garbage-collected by the browser once
      // it's actually removed from the DOM — no explicit teardown is needed,
      // and cancelling the rAF loop above already stops all GPU work the
      // instant this effect is cleaned up.
    };
  }, []);

  return (
    <>
      {/* Static fallback shown (via CSS, always present under the canvas) when
          reduced motion is requested — the canvas itself never starts
          drawing in that case, so this is what's actually visible. */}
      <div
        className={`${className ?? ''} motion-reduce:block hidden`}
        style={{
          background:
            'radial-gradient(60% 60% at 50% 20%, color-mix(in oklab, var(--hud-primary) 12%, transparent) 0%, transparent 70%), var(--hud-bg-deep)',
        }}
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className={`${className ?? ''} motion-reduce:hidden`}
        // Softened/receded "seen from a distance, through glass" look: a
        // gentle blur plus reduced opacity so the road reads as ambient
        // background texture behind the (already glass-panelled) content,
        // never competing with it for attention.
        style={{ filter: 'blur(3px)', opacity: 0.6 }}
        aria-hidden="true"
      />
    </>
  );
}
