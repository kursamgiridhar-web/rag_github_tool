// Tiny safe markdown renderer (no HTML injection): code blocks, lists, bold, inline code, and [n] citations.

function inline(text, onCite, keyPrefix) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[\d+\])/g).filter(Boolean);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    const cite = part.match(/^\[(\d+)\]$/);
    if (cite) {
      return (
        <button key={key} type="button" className="cite" onClick={() => onCite(Number(cite[1]))} title={`Show evidence ${cite[1]}`}>
          {cite[1]}
        </button>
      );
    }
    return part;
  });
}

export default function Markdown({ text, onCite }) {
  const blocks = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={blocks.length}><code>{code.join("\n")}</code></pre>);
    } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const firstLine = line;
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      const start = ordered ? Number(firstLine.match(/\d+/)[0]) : undefined; // keep original numbering after nested bullets
      blocks.push(<Tag key={blocks.length} start={start}>{items.map((it, k) => <li key={k}>{inline(it, onCite, `l${blocks.length}-${k}`)}</li>)}</Tag>);
    } else if (/^#{1,4}\s+/.test(line)) {
      blocks.push(<h3 key={blocks.length}>{inline(line.replace(/^#{1,4}\s+/, ""), onCite, `h${blocks.length}`)}</h3>);
      i++;
    } else if (line.trim() === "") {
      i++;
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) && !lines[i].trim().startsWith("```") && !/^#{1,4}\s+/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={blocks.length}>{inline(para.join(" "), onCite, `p${blocks.length}`)}</p>);
    }
  }
  return <div className="markdown">{blocks}</div>;
}
