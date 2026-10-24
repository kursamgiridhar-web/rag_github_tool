import { useEffect, useRef } from "react";

// A rotating 3D constellation drawn on a 2D canvas (no 3D library needed).
// Each frame: rotate points around Y and X, then apply perspective: scale = fov / (fov + z).
// Edges are computed once because rotation does not change distances between points.
const NODE_COUNT = 64;
const EDGE_DISTANCE = 0.5;
const MAX_EDGES_PER_NODE = 3;
const FOV = 2.4;

function buildGraph() {
  const nodes = Array.from({ length: NODE_COUNT }, () => {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = 0.45 + Math.random() * 0.55;
    const s = Math.sqrt(1 - u * u);
    return { x: r * s * Math.cos(theta), y: r * u, z: r * s * Math.sin(theta) };
  });
  const edges = [];
  const degree = new Array(NODE_COUNT).fill(0);
  for (let a = 0; a < NODE_COUNT; a++) {
    for (let b = a + 1; b < NODE_COUNT; b++) {
      if (degree[a] >= MAX_EDGES_PER_NODE || degree[b] >= MAX_EDGES_PER_NODE) continue;
      const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y, nodes[a].z - nodes[b].z);
      if (d < EDGE_DISTANCE) {
        edges.push([a, b]);
        degree[a]++;
        degree[b]++;
      }
    }
  }
  return { nodes, edges };
}

export default function NetworkBackground({ reduceMotion, boost }) {
  const canvasRef = useRef(null);
  const boostRef = useRef(boost);
  boostRef.current = boost; // lets the network "speed up" during the connect sequence

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { nodes, edges } = buildGraph();
    const packets = Array.from({ length: 7 }, () => ({ edge: Math.floor(Math.random() * edges.length), t: Math.random(), dir: 1 }));
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let angle = 0, width = 0, height = 0, frame = 0, last = performance.now();

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function project(n) {
      const cy = Math.cos(angle + pointer.x * 0.6), sy = Math.sin(angle + pointer.x * 0.6);
      const cx = Math.cos(pointer.y * 0.4 + 0.25), sx = Math.sin(pointer.y * 0.4 + 0.25);
      const x1 = n.x * cy - n.z * sy;
      const z1 = n.x * sy + n.z * cy;
      const y2 = n.y * cx - z1 * sx;
      const z2 = n.y * sx + z1 * cx;
      const scale = FOV / (FOV + z2);
      const size = Math.min(width, height) * 0.62;
      return { x: width * 0.5 + x1 * scale * size, y: height * 0.5 + y2 * scale * size, scale, depth: (z2 + 1) / 2 };
    }

    function draw(now) {
      const dt = Math.min(now - last, 50);
      last = now;
      if (!reduceMotion) {
        angle += dt * 0.00007 * (boostRef.current ? 4 : 1);
        pointer.x += (pointer.tx - pointer.x) * 0.04;
        pointer.y += (pointer.ty - pointer.y) * 0.04;
      }
      ctx.clearRect(0, 0, width, height);
      const pts = nodes.map(project);

      ctx.lineWidth = 1;
      for (const [a, b] of edges) {
        const alpha = 0.04 + 0.16 * ((pts[a].depth + pts[b].depth) / 2);
        ctx.strokeStyle = `rgba(124, 108, 255, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[b].x, pts[b].y);
        ctx.stroke();
      }
      for (const p of pts) {
        ctx.fillStyle = `rgba(150, 170, 255, ${0.15 + 0.5 * p.depth})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1 + 2.2 * p.scale * p.depth, 0, Math.PI * 2);
        ctx.fill();
      }
      // Evidence packets travelling along edges.
      for (const k of packets) {
        if (!reduceMotion) {
          k.t += (dt / 1400) * (boostRef.current ? 2.5 : 1);
          if (k.t >= 1) {
            const endNode = edges[k.edge][1];
            const next = edges.findIndex(([a], i) => a === endNode && i !== k.edge);
            k.edge = next >= 0 ? next : Math.floor(Math.random() * edges.length);
            k.t = 0;
          }
        }
        const [a, b] = edges[k.edge];
        const x = pts[a].x + (pts[b].x - pts[a].x) * k.t;
        const y = pts[a].y + (pts[b].y - pts[a].y) * k.t;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, "rgba(56, 214, 232, 0.9)");
        g.addColorStop(1, "rgba(56, 214, 232, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduceMotion) frame = requestAnimationFrame(draw);
    }

    function onPointerMove(e) {
      pointer.tx = (e.clientX / width - 0.5) * 2;
      pointer.ty = (e.clientY / height - 0.5) * 2;
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [reduceMotion]);

  return <canvas ref={canvasRef} className="network" aria-hidden="true" />;
}
