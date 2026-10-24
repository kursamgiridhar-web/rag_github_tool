// Friendly replies for compliments, thanks and greetings, answered locally.
// These are not questions about the code, so they skip retrieval: no evidence, no "not found" badge.
const TECH = /\b(how|what|why|where|which|when|who|explain|show|find|trace|list|file|function|code|bug|error|config|route|api|database|test)\b/i;
const THANKS = /\b(thanks|thank you|thank u|thx|ty|cheers|appreciate)\b/i;
const GREET = /^(hi|hello|hey|yo|hola|good (morning|afternoon|evening))\b/i;
const BYE = /\b(bye|goodbye|see you|cya)\b/i;
const PRAISE = /\b(good|great|nice|awesome|amazing|cool|perfect|excellent|brilliant|fantastic|wonderful|love it|well done|good job|great job|nice work|working fine|works fine|works well|impressive|helpful)\b/i;

export function smallTalkReply(raw, label) {
  const q = raw.trim();
  if (q.length === 0 || q.includes("?") || q.split(/\s+/).length > 9 || TECH.test(q)) return null;
  const more = `Ask me anything about **${label}**, for example how a feature works, where something is configured, or why something might fail. I will answer with the exact code as evidence.`;
  if (THANKS.test(q)) return `You're welcome! ${more}`;
  if (BYE.test(q)) return "Goodbye! Your investigation is saved in the sidebar, so you can pick it up again any time.";
  if (GREET.test(q)) return `Hello! ${more}`;
  if (PRAISE.test(q)) return `Thank you, glad it is helping! ${more}`;
  return null;
}
