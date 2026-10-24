import { useRef } from "react";

// The five layers of the sample app, drawn as an exploded isometric stack.
// Bars are neutral placeholders (not code), so nothing here pretends to be a real file.
const LAYERS = [
  { path: "src/components/LoginForm.jsx", role: "Frontend" },
  { path: "src/api/client.js", role: "API client" },
  { path: "server/routes/auth.js", role: "Route" },
  { path: "server/services/authService.js", role: "Service" },
  { path: "server/db/users.js", role: "Database" },
];

export default function FileStack3D() {
  const stageRef = useRef(null);

  // Tilt follows the pointer. We set CSS variables directly to avoid re-rendering React on every move.
  function handleMove(e) {
    const box = stageRef.current.getBoundingClientRect();
    const px = (e.clientX - box.left) / box.width - 0.5;
    const py = (e.clientY - box.top) / box.height - 0.5;
    stageRef.current.style.setProperty("--rx", `${(-py * 14).toFixed(2)}deg`);
    stageRef.current.style.setProperty("--ry", `${(px * 18).toFixed(2)}deg`);
  }
  function handleLeave() {
    stageRef.current.style.setProperty("--rx", "0deg");
    stageRef.current.style.setProperty("--ry", "0deg");
  }

  return (
    <div className="stage3d" ref={stageRef} onPointerMove={handleMove} onPointerLeave={handleLeave}>
      <div className="stack" role="img" aria-label="Five layers of an example app connected by one thread: frontend, API client, route, service, database">
        <div className="thread"><span className="packet" /></div>
        {LAYERS.map((layer, i) => (
          <div className="pane" style={{ "--i": i }} key={layer.path}>
            <div className="pane-top">
              <span className="pane-role">{layer.role}</span>
            </div>
            <div className="pane-path">{layer.path}</div>
            <div className="pane-bars"><i /><i /><i /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
