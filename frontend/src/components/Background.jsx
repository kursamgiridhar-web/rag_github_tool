import { Component, lazy, Suspense } from "react";
import NetworkBackground from "./NetworkBackground.jsx";

// The WebGL scene loads on demand so the page appears instantly.
const Scene3D = lazy(() => import("./Scene3D.jsx"));

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

// If anything in the 3D scene throws, fall back to the lightweight 2D canvas version.
class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.warn("3D background failed, using 2D fallback:", error.message); }
  render() {
    return this.state.failed ? <NetworkBackground {...this.props.fallbackProps} /> : this.props.children;
  }
}

export default function Background({ reduceMotion, boost }) {
  if (!webglAvailable()) return <NetworkBackground reduceMotion={reduceMotion} boost={boost} />;
  return (
    <SceneBoundary fallbackProps={{ reduceMotion, boost }}>
      <Suspense fallback={null}>
        <Scene3D reduceMotion={reduceMotion} boost={boost} />
      </Suspense>
    </SceneBoundary>
  );
}
