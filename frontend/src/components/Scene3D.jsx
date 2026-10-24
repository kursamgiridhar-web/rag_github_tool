import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Real WebGL version of the background: a rotating 3D constellation of "files",
// joined by edges, with cyan evidence packets travelling along them.
const NODE_COUNT = 110;
const MAX_EDGES_PER_NODE = 3;
const PACKET_COUNT = 9;
const RADIUS = 5.8;
const EDGE_DISTANCE = RADIUS * 0.27; // scales with the sphere so it stays well connected

function buildGraph() {
  const nodes = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = RADIUS * (0.45 + Math.random() * 0.55);
    const s = Math.sqrt(1 - u * u);
    nodes.push(new THREE.Vector3(r * s * Math.cos(theta), r * u, r * s * Math.sin(theta)));
  }
  const edges = [];
  const degree = new Array(NODE_COUNT).fill(0);
  for (let a = 0; a < NODE_COUNT; a++) {
    for (let b = a + 1; b < NODE_COUNT; b++) {
      if (degree[a] >= MAX_EDGES_PER_NODE || degree[b] >= MAX_EDGES_PER_NODE) continue;
      if (nodes[a].distanceTo(nodes[b]) < EDGE_DISTANCE) {
        edges.push([a, b]);
        degree[a]++;
        degree[b]++;
      }
    }
  }
  return { nodes, edges };
}

// A soft round sprite so points look like glowing dots instead of squares.
function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function Constellation({ boost, reduceMotion }) {
  const group = useRef();
  const packetGeometry = useRef();
  const pointer = useRef({ x: 0, y: 0 });
  const glow = useMemo(makeGlowTexture, []);
  const { nodes, edges } = useMemo(buildGraph, []);

  const nodePositions = useMemo(() => new Float32Array(nodes.flatMap((v) => [v.x, v.y, v.z])), [nodes]);
  const linePositions = useMemo(
    () => new Float32Array(edges.flatMap(([a, b]) => [...nodes[a].toArray(), ...nodes[b].toArray()])),
    [nodes, edges]
  );
  const packets = useRef(
    Array.from({ length: PACKET_COUNT }, () => ({ edge: Math.floor(Math.random() * edges.length), t: Math.random() }))
  );
  const packetPositions = useMemo(() => new Float32Array(PACKET_COUNT * 3), []);

  // The canvas has pointer-events: none, so we listen on the window ourselves.
  useEffect(() => {
    const onMove = (e) => {
      pointer.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, delta) => {
    if (reduceMotion) return;
    const dt = Math.min(delta, 0.05);
    group.current.rotation.y += dt * 0.05 * (boost ? 4 : 1);
    // Smoothly lean toward the pointer (parallax).
    group.current.rotation.x += (pointer.current.y * 0.35 - group.current.rotation.x) * 0.03;
    state.camera.position.x += (pointer.current.x * 1.4 - state.camera.position.x) * 0.03;
    state.camera.lookAt(0, 0, 0);

    const attr = packetGeometry.current.attributes.position;
    packets.current.forEach((p, i) => {
      p.t += dt * 0.7 * (boost ? 2.5 : 1);
      if (p.t >= 1) {
        const end = edges[p.edge][1];
        const next = edges.findIndex(([a], idx) => a === end && idx !== p.edge);
        p.edge = next >= 0 ? next : Math.floor(Math.random() * edges.length);
        p.t = 0;
      }
      const [a, b] = edges[p.edge];
      const x = nodes[a].x + (nodes[b].x - nodes[a].x) * p.t;
      const y = nodes[a].y + (nodes[b].y - nodes[a].y) * p.t;
      const z = nodes[a].z + (nodes[b].z - nodes[a].z) * p.t;
      attr.setXYZ(i, x, y, z);
    });
    attr.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={linePositions.length / 3} array={linePositions} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#7c6cff" transparent opacity={0.28} />
      </lineSegments>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={NODE_COUNT} array={nodePositions} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={glow} color="#9db0ff" size={0.34} sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <points>
        <bufferGeometry ref={packetGeometry}>
          <bufferAttribute attach="attributes-position" count={PACKET_COUNT} array={packetPositions} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial map={glow} color="#38d6e8" size={0.75} sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  );
}

export default function Scene3D({ reduceMotion, boost }) {
  return (
    <Canvas
      className="network"
      // "demand" renders once and stops, so reduced motion uses no GPU time.
      frameloop={reduceMotion ? "demand" : "always"}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 8], fov: 55 }}
      // r3f gives its wrapper inline styles (position: relative), which beat our CSS class,
      // so the full-screen positioning must be passed here.
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
    >
      <fog attach="fog" args={["#0b0d12", 8, 17]} />
      <Constellation boost={boost} reduceMotion={reduceMotion} />
    </Canvas>
  );
}
