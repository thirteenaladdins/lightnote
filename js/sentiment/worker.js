// js/sentiment/worker.js
let LEX = null;

async function ensureLexicon() {
  if (LEX) return;
  // Resolve path relative to this worker file:
  const url = new URL("./lexicon.min.json", import.meta.url);
  const res = await fetch(url);
  LEX = await res.json();
}

// super-light scorer (VADER-lite: sum/len). You can paste your fuller logic here.
function score(text) {
  const tokens = text.toLowerCase().match(/\b[\p{L}\p{N}'-]+\b/gu) || [];
  if (!tokens.length) return { compound: 0, pos: 0, neg: 0, neu: 1 };
  let s = 0;
  for (const t of tokens) if (LEX[t] !== undefined) s += LEX[t];
  const compound = Math.max(-1, Math.min(1, s / Math.sqrt(tokens.length))); // crude norm
  return {
    compound,
    pos: compound > 0.05 ? compound : 0,
    neg: compound < -0.05 ? -compound : 0,
    neu: compound >= -0.05 && compound <= 0.05 ? 1 : 0,
  };
}

self.onmessage = async (e) => {
  const { id, text } = e.data;
  try {
    await ensureLexicon();
    const result = score(text || "");
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
