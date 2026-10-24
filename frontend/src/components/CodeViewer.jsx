import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Highlight } from "prism-react-renderer";
import { Copy, Check } from "lucide-react";
import { fileBadge } from "../lib/repoTree.js";

// Syntax colours chosen to match the app palette.
const THEME = {
  plain: { color: "#d8dce6", backgroundColor: "transparent" },
  styles: [
    { types: ["comment", "prolog"], style: { color: "#5f6b85", fontStyle: "italic" } },
    { types: ["punctuation", "operator"], style: { color: "#8b95a9" } },
    { types: ["keyword", "tag", "selector", "atrule"], style: { color: "#a99bff" } },
    { types: ["string", "attr-value", "template-string"], style: { color: "#7ee0b0" } },
    { types: ["function", "class-name", "maybe-class-name"], style: { color: "#6fe3f0" } },
    { types: ["number", "boolean", "constant", "regex"], style: { color: "#f5b84b" } },
    { types: ["property", "attr-name", "parameter"], style: { color: "#c4d0ff" } },
  ],
};

// `highlight` is { start, end } (1-based, inclusive). Used by citations in later stages.
export default function CodeViewer({ file, highlight, startLine = 1, reduceMotion }) {
  const scrollRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const badge = fileBadge(file.path);
  const lineCount = file.content.split("\n").length;

  // Scroll so the highlighted range sits in the middle of the viewer.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    if (!highlight) { box.scrollTo({ top: 0 }); return; }
    const row = box.querySelector(`[data-line="${highlight.start}"]`);
    if (row) box.scrollTo({ top: row.offsetTop - box.clientHeight / 2, behavior: reduceMotion ? "auto" : "smooth" });
  }, [file.path, highlight, startLine, reduceMotion]);

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(file.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard can be blocked; nothing else to do */ }
  }

  return (
    <motion.section
      className="viewer"
      key={file.path}
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      aria-label={`Source of ${file.path}`}
    >
      <header className="viewer-head">
        <span className={`ftype ${badge.kind}`}>{badge.label}</span>
        <span className="viewer-path">{file.path}</span>
        <span className="viewer-meta">lines {startLine}–{startLine + lineCount - 1}</span>
        <button type="button" className="icon-btn" onClick={copyPath} aria-label="Copy file path">
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </header>
      <div className="code-scroll" ref={scrollRef} tabIndex={0}>
        <Highlight theme={THEME} code={file.content} language={file.language}>
          {({ tokens, getLineProps, getTokenProps }) => (
            <pre className="code">
              {tokens.map((line, i) => {
                const n = i + startLine;
                const on = highlight && n >= highlight.start && n <= highlight.end;
                return (
                  <div key={i} data-line={n} className={`code-row ${on ? "hit" : ""}`} {...getLineProps({ line })}>
                    <span className="gutter">{n}</span>
                    <span className="code-text">
                      {line.map((token, k) => <span key={k} {...getTokenProps({ token })} />)}
                      {line.length === 0 || (line.length === 1 && line[0].content === "") ? " " : null}
                    </span>
                  </div>
                );
              })}
            </pre>
          )}
        </Highlight>
      </div>
    </motion.section>
  );
}
