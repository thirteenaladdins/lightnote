// weeklyInsights.js — enhanced weekly insights (LLM themes) — updated

// ──────────────────────────────────────────────────────────────────────────────
// Imports
import { weekKey, prevWeekKey, weekRangeFromKey } from "./utils/time.js";
import { rollupWeek /*, weeklyDigestText*/ } from "./utils/insights.js";
import { llmAsk } from "./llm.js";

// ──────────────────────────────────────────────────────────────────────────────
/** DOM refs (openWeek, copyDigest optional) */
const el = {
  weeklyDigest: document.getElementById("weeklyDigest"),
  digestDates: document.getElementById("digestDates"),
  prevWeek: document.getElementById("prevWeek"),
  thisWeek: document.getElementById("thisWeek"),
  saveInsight: document.getElementById("saveInsight"),
  askAI: document.getElementById("askAI"),
  insightStatus: document.getElementById("insightStatus"),
  insightCount: document.getElementById("insightCount"),
  clearInsights: document.getElementById("clearInsights"),
  savedInsights: document.getElementById("savedInsights"),
  openWeek: document.getElementById("openWeek"),
  copyDigest: document.getElementById("copyDigest"),
};

// ──────────────────────────────────────────────────────────────────────────────
// Storage keys
const INSIGHTS_KEY = "ln.insights";
const ROLLUP_KEY = "ln.weekly.rollups.v1"; // bump if rollup shape changes
const THEME_CACHE_KEY = "ln.theme.llm.v1"; // { [weekKey]: { ts, themes } }

// ──────────────────────────────────────────────────────────────────────────────
// Local helpers: storage
function loadInsights() {
  return JSON.parse(localStorage.getItem(INSIGHTS_KEY) || "[]");
}
function saveInsights(insights) {
  localStorage.setItem(INSIGHTS_KEY, JSON.stringify(insights));
}
function loadRollupCache() {
  return JSON.parse(localStorage.getItem(ROLLUP_KEY) || "{}");
}
function saveRollupCache(obj) {
  localStorage.setItem(ROLLUP_KEY, JSON.stringify(obj));
}
function loadThemeCache() {
  return JSON.parse(localStorage.getItem(THEME_CACHE_KEY) || "{}");
}
function saveThemeCache(obj) {
  localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(obj));
}

// ──────────────────────────────────────────────────────────────────────────────
// Entries retrieval
function getAllEntries() {
  return JSON.parse(localStorage.getItem("lightnote.entries.v1") || "[]");
}
function getEntriesForWeek(wk) {
  const { start, end } = weekRangeFromKey(wk);
  const s = +start,
    e = +end;
  return getAllEntries().filter((ei) => {
    const t = +new Date(ei.created);
    return t >= s && t < e;
  });
}
function getPrevWeekEntries(wk) {
  return getEntriesForWeek(prevWeekKey(wk));
}

// ──────────────────────────────────────────────────────────────────────────────
// Rollup caching (naive hash = entry count for that week; good enough for v1)
function rollupWeekCached(wk, slice) {
  const cache = loadRollupCache();

  // lightweight checksum: count + sum of rounded sentiment * 1000
  const sum = slice.reduce((acc, e) => {
    const s = entryScore(e);
    return acc + (s === null ? 0 : Math.round(s * 1000));
  }, 0);
  const hash = `${slice.length}:${sum}`;

  if (cache[wk]?.hash === hash) return cache[wk].data;

  const data = rollupWeek(slice); // your updated rollup that reads both shapes
  cache[wk] = { hash, data };
  saveRollupCache(cache);
  return data;
}

// ──────────────────────────────────────────────────────────────────────────────
// Insight enrichments (tokenizer, entities, co-occur, notables, etc.)
const STOP = new Set([
  // pronouns & self refs
  "i",
  "im",
  "i'm",
  "id",
  "i'd",
  "ill",
  "i'll",
  "ive",
  "i've",
  "you",
  "your",
  "yours",
  "u",
  "we",
  "our",
  "ours",
  "he",
  "she",
  "they",
  "them",
  "their",
  "theirs",
  "me",
  "my",
  "mine",
  "him",
  "his",
  "her",
  "hers",
  "ourselves",
  "yourself",
  "yourselves",
  "himself",
  "herself",
  "themselves",
  "someone",
  "something",
  "anything",
  "everything",
  "everyone",
  "anyone",
  // articles, determiners, connectives
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "same",
  "and",
  "or",
  "but",
  "so",
  "if",
  "than",
  "then",
  "because",
  "as",
  "while",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "whose",
  // prepositions
  "of",
  "in",
  "on",
  "at",
  "for",
  "from",
  "by",
  "with",
  "about",
  "into",
  "over",
  "out",
  "up",
  "down",
  "to",
  "through",
  "between",
  "during",
  "before",
  "after",
  "under",
  "above",
  "below",
  "within",
  "without",
  "onto",
  "off",
  // auxiliaries & modals
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "doing",
  "have",
  "has",
  "had",
  "having",
  "can",
  "could",
  "may",
  "might",
  "must",
  "shall",
  "should",
  "will",
  "would",
  "ought",
  "need",
  "needs",
  "needed",
  "let",
  "lets",
  // high-frequency light verbs (theme-diluting)
  "get",
  "gets",
  "got",
  "getting",
  "gotten",
  "make",
  "makes",
  "made",
  "making",
  "know",
  "knows",
  "knew",
  "known",
  "knowing",
  "think",
  "thinks",
  "thought",
  "thinking",
  "feel",
  "feels",
  "felt",
  "feeling",
  "want",
  "wants",
  "wanted",
  "wanting",
  "try",
  "tries",
  "tried",
  "trying",
  "seem",
  "seems",
  "seemed",
  "seeming",
  "go",
  "goes",
  "went",
  "gone",
  "going",
  "come",
  "comes",
  "came",
  "coming",
  "take",
  "takes",
  "took",
  "taken",
  "taking",
  "give",
  "gives",
  "gave",
  "given",
  "giving",
  "put",
  "puts",
  "putting",
  "keep",
  "keeps",
  "kept",
  "keeping",
  "start",
  "starts",
  "started",
  "starting",
  "say",
  "says",
  "said",
  "saying",
  "tell",
  "tells",
  "told",
  "telling",
  "see",
  "sees",
  "saw",
  "seen",
  "seeing",
  "look",
  "looks",
  "looked",
  "looking",
  "ask",
  "asks",
  "asked",
  "asking",
  "use",
  "uses",
  "used",
  "using",
  "work",
  "works",
  "worked",
  "working",
  "need",
  "needing",
  // discourse fillers / hedges / slang
  "just",
  "really",
  "like",
  "kind",
  "sort",
  "maybe",
  "perhaps",
  "actually",
  "basically",
  "literally",
  "honestly",
  "probably",
  "possibly",
  "kinda",
  "sorta",
  "gonna",
  "wanna",
  "yeah",
  "ok",
  "okay",
  "uh",
  "um",
  "hmm",
  // negation
  "no",
  "not",
  "never",
  "dont",
  "doesnt",
  "didnt",
  "cant",
  "couldnt",
  "shouldnt",
  "wouldnt",
  "wont",
  "isnt",
  "arent",
  "wasnt",
  "werent",
  // time-ish / generic
  "today",
  "yesterday",
  "tomorrow",
  "now",
  "again",
  "already",
  "still",
  "then",
  "time",
  "times",
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
  "it",
  "its",
  "it's",
  "what",
  "whats",
  "how",
  "there",
  "here",
  // generic nouns
  "thing",
  "things",
  "stuff",
  "way",
  "lot",
  "bit",
  "kind",
]);

// Keep apostrophes during clean, then normalize
function tokens(txt) {
  const raw = (txt || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s'’-]/g, " ")
    .replace(/’/g, "'")
    .replace(/\bdo\s*not\b/g, "don't")
    .replace(/\bcan\s*not\b/g, "can't")
    .replace(/\bwill\s*not\b/g, "won't");
  const norm = raw.replace(/'/g, ""); // "don't" -> "dont", "i'm" -> "im"
  return norm.split(/\s+/).filter((w) => w && w.length >= 3 && !STOP.has(w));
}

function topTerms(entries, k = 8) {
  const uni = new Map(),
    bi = new Map();
  for (const e of entries) {
    const t = tokens(e.text || "");
    for (let i = 0; i < t.length; i++) {
      uni.set(t[i], (uni.get(t[i]) || 0) + 1);
      if (i < t.length - 1) {
        const b = `${t[i]} ${t[i + 1]}`;
        bi.set(b, (bi.get(b) || 0) + 1);
      }
    }
  }
  const sortTop = (m) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
  return { words: sortTop(uni), phrases: sortTop(bi) };
}

function lowMoodTerms(entries, thresh = -0.2, k = 6) {
  const low = entries.filter((e) => (e?.meta?.sent?.compound ?? 0) <= thresh);
  return topTerms(low, k);
}

function clip120(s) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > 120 ? t.slice(0, 120) + "…" : t;
}

// NEW: tiny local summary — first sentence or 140 chars
function summarizeText(s) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/(.+?[.!?])(\s|$)/);
  const sent = m ? m[1] : t;
  return sent.length > 140 ? sent.slice(0, 140) + "…" : sent;
}

// UPDATED: notables now include id, score, summary
function notables(entries) {
  if (!entries.length) return { worst: null, best: null };
  const bySentAsc = [...entries].sort((a, b) => {
    const sa = a.meta?.sent?.compound ?? 0;
    const sb = b.meta?.sent?.compound ?? 0;
    if (sa !== sb) return sa - sb;
    return a.text.length - b.text.length;
  });
  const bySentDesc = [...entries].sort((a, b) => {
    const sa = a.meta?.sent?.compound ?? 0;
    const sb = b.meta?.sent?.compound ?? 0;
    if (sa !== sb) return sb - sa;
    return b.text.length - a.text.length;
  });
  const worst = bySentAsc[0] || null;
  const best = bySentDesc[0] || null;
  const make = (e) =>
    e
      ? {
          id: e.id,
          score: +(e.meta?.sent?.compound ?? 0),
          clip: clip120(e.text),
          summary: summarizeText(e.text),
        }
      : null;
  return { worst: make(worst), best: make(best) };
}

function whenSentence(entries) {
  if (!entries.length) return "";
  const hours = new Array(24).fill(0),
    dows = new Array(7).fill(0);
  for (const e of entries) {
    const d = new Date(e.created);
    hours[d.getHours()]++;
    dows[d.getDay()]++;
  }
  const topDowIdx = dows.indexOf(Math.max(...dows));
  const topHourIdx = hours.indexOf(Math.max(...hours));
  const bucket =
    topHourIdx < 12 ? "morning" : topHourIdx < 18 ? "afternoon" : "evening";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `You wrote mostly on ${days[topDowIdx]} ${bucket}.`;
}

function fmtDeltaAbs(cur, prev) {
  if (prev == null) return "";
  const d = cur - prev;
  if (d === 0) return "±0";
  return d > 0 ? `+${d}` : `${d}`;
}

// helper (reuse wherever you need a score)
function entryScore(e) {
  if (typeof e?.meta?.sent?.compound === "number") return e.meta.sent.compound;
  if (typeof e?.compound === "number") return e.compound;
  return null;
}

function moodStatsPresent(entries) {
  return entries.some((e) => entryScore(e) !== null);
}

// Entities to track (user-editable later; seed here)
function trackedEntities() {
  const raw = localStorage.getItem("ln.track") || "charlotte,mum,work,sleep";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function entityImpacts(curSlice, prevSlice) {
  const names = trackedEntities();
  const cur = {},
    prev = {};
  const take = (bag, e) => {
    const t = (e.text || "").toLowerCase();
    const m = e?.meta?.sent?.compound;
    for (const n of names)
      if (t.includes(n)) {
        bag[n] ||= { mentions: 0, moods: [] };
        bag[n].mentions++;
        if (typeof m === "number") bag[n].moods.push(m);
      }
  };
  curSlice.forEach((e) => take(cur, e));
  prevSlice.forEach((e) => take(prev, e));

  const fmt = [];
  const union = new Set([...Object.keys(cur), ...Object.keys(prev)]);
  for (const n of union) {
    const c = cur[n] || { mentions: 0, moods: [] };
    const p = prev[n] || { mentions: 0, moods: [] };
    const avg = (a) =>
      a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
    const cMood = avg(c.moods),
      pMood = avg(p.moods);
    const dMent = c.mentions - p.mentions;
    const hasMood = Number.isFinite(cMood);
    const moodStr = hasMood
      ? `, mood ${cMood.toFixed(2)}` +
        (Number.isFinite(pMood)
          ? ` (Δ ${cMood - pMood >= 0 ? "+" : ""}${(cMood - pMood).toFixed(2)})`
          : "")
      : "";
    let dLabel = "";
    if (p.mentions === 0 && c.mentions > 0) dLabel = "new";
    else if (dMent !== 0) dLabel = `${dMent >= 0 ? "+" : ""}${dMent}`;
    if (c.mentions > 0) {
      fmt.push(
        `**${n}** ${c.mentions}×${dLabel ? ` (${dLabel})` : ""}${moodStr}`
      );
    }
  }
  return fmt;
}

// Replace legacy ID markers with snippets if present
function enrichDigestTextWithSnippets(text, slice) {
  return text
    .replace(/Most negative entry:\s*#([a-f0-9-]+)/i, (_m, id) => {
      const e = slice.find((x) => x.id === id);
      return e ? `Most negative: “${clip120(e.text)}”` : _m;
    })
    .replace(/Most positive entry:\s*#([a-f0-9-]+)/i, (_m, id) => {
      const e = slice.find((x) => x.id === id);
      return e ? `Most positive: “${clip120(e.text)}”` : _m;
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// LLM THEME EXTRACTION (works with your llmAsk)
function clipForLLM(s) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > 280 ? t.slice(0, 280) + "…" : t;
}
function sampleEntriesForThemes(entries, maxItems = 18) {
  const byMood = [...entries].sort(
    (a, b) => (a.meta?.sent?.compound ?? 0) - (b.meta?.sent?.compound ?? 0)
  );
  const lows = byMood.slice(0, 4);
  const highs = byMood.slice(-4);
  const rest = entries
    .filter((e) => !lows.includes(e) && !highs.includes(e))
    .sort((a, b) => b.created - a.created)
    .slice(0, Math.max(0, maxItems - lows.length - highs.length));
  const picked = [...lows, ...highs, ...rest].slice(0, maxItems);
  return picked
    .map(
      (e) =>
        `- [${new Date(e.created).toISOString().slice(0, 10)}] ${clipForLLM(
          e.text
        )}`
    )
    .join("\n");
}

function parseJSONLoose(s) {
  const m = s && s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = m ? m[1] : s || "";
  try {
    return JSON.parse(raw);
  } catch {}
  try {
    const fixed = raw
      .replace(/,(\s*[}\]])/g, "$1")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

async function llmExtractThemesForWeek(weekKey, entries) {
  const cache = loadThemeCache();
  const hit = cache[weekKey];
  if (hit && Array.isArray(hit.themes?.words)) return hit.themes;

  const context = sampleEntriesForThemes(entries);
  const prompt = `
You are an analyst extracting weekly THEMES from journal snippets.
Return STRICT JSON ONLY in this schema:

{
  "words": ["<top single words, 3-8>"],
  "phrases": ["<top bigrams/trigrams, 2-6>"],
  "entities": ["<names or recurring proper nouns, 0-6>"],
  "evidence": [{"theme":"<short label>","quotes":["<short quote>"]}]
}

Guidelines:
- Prefer DISTINCTIVE themes for THIS WEEK (avoid generic words like "time", "know", "feel", "just", "want").
- Create short human labels if needed ("boundary issues", "late nights", "relationship conflict").
- Evidence quotes must be SHORT (≤120 chars), trimmed, no rephrasing.

WEEK SNIPPETS:
${context}
  `.trim();

  const reply = await llmAsk({ prompt });
  const json = parseJSONLoose(reply) || {};
  const themes = {
    words: Array.isArray(json.words) ? json.words.slice(0, 8) : [],
    phrases: Array.isArray(json.phrases) ? json.phrases.slice(0, 6) : [],
    entities: Array.isArray(json.entities) ? json.entities.slice(0, 6) : [],
    evidence: Array.isArray(json.evidence) ? json.evidence.slice(0, 4) : [],
  };
  cache[weekKey] = { ts: Date.now(), themes };
  saveThemeCache(cache);
  return themes;
}

// ──────────────────────────────────────────────────────────────────────────────
// Digest generation and UI (async for LLM themes)

async function generateCurrentDigest(wk = weekKey(new Date())) {
  const range = weekRangeFromKey(wk);
  const slice = getEntriesForWeek(wk);
  const prevSlice = getPrevWeekEntries(wk);

  const cur = rollupWeekCached(wk, slice);
  const prev = rollupWeekCached(prevWeekKey(wk), prevSlice);

  if (!cur || !slice.length) return "No entries yet this week.";

  const hasPrev = prevSlice.length > 0;

  // Lines: entries + mood (average if present, otherwise "not yet analysed")
  const entriesLine =
    `Entries: ${cur.count}` +
    (hasPrev ? ` (${fmtDeltaAbs(cur.count, prev.count)})` : "");

  let moodLine = "";
  if (moodStatsPresent(slice)) {
    const md = hasPrev
      ? fmtDeltaAbs(+cur.moodAvg.toFixed(2), +prev.moodAvg.toFixed(2))
      : "";
    moodLine =
      `Mood: ${cur.moodAvg.toFixed(2)} (± ${cur.moodVol.toFixed(2)})` +
      (md ? ` — ${md} vs last week` : "");
  } else {
    moodLine = `Mood: (not yet analysed)`;
  }

  const notes = notables(slice);
  const when = whenSentence(slice);

  // LLM THEMES (with safe fallback to heuristic)
  let tline = "";
  let evidenceLines = [];
  try {
    const llmThemes = await llmExtractThemesForWeek(wk, slice);
    const label =
      llmThemes.phrases && llmThemes.phrases.length
        ? llmThemes.phrases.slice(0, 3).join(" · ")
        : (llmThemes.words || []).slice(0, 5).join(", ");
    if (label) tline = `Themes: ${label}`;
    if (Array.isArray(llmThemes.evidence) && llmThemes.evidence.length) {
      evidenceLines = llmThemes.evidence
        .map((ev) => {
          const q =
            ev.quotes && ev.quotes[0]
              ? clip120(ev.quotes[0]).replace(/^“|”$/g, "")
              : "";
          return q ? `• ${ev.theme}: “${q}”` : "";
        })
        .filter(Boolean);
    }
  } catch {
    const heuristic = topTerms(slice, 8);
    const words = (heuristic.words || []).map(([w]) => w);
    const phrases = (heuristic.phrases || []).map(([p]) => p);
    const label = phrases.length
      ? phrases.slice(0, 3).join(" · ")
      : words.slice(0, 5).join(", ");
    if (label) tline = `Themes: ${label}`;
  }

  // Notables lines with ID, score, summary
  const worstLine = notes.worst
    ? `Notable ↓ “${notes.worst.clip}”  (id: ${notes.worst.id || "—"}, score: ${
        notes.worst.score >= 0 ? "+" : ""
      }${notes.worst.score.toFixed(2)}) — ${notes.worst.summary}`
    : "";
  const bestLine = notes.best
    ? `Notable ↑ “${notes.best.clip}”  (id: ${notes.best.id || "—"}, score: ${
        notes.best.score >= 0 ? "+" : ""
      }${notes.best.score.toFixed(2)}) — ${notes.best.summary}`
    : "";

  // Compose digest
  let text = [
    `Weekly Digest — ${wk}`,
    `${range.start.toDateString()} → ${range.end.toDateString()}`,
    entriesLine,
    moodLine,
    when,
    tline,
    worstLine,
    bestLine,
    ...evidenceLines,
  ]
    .filter(Boolean)
    .join("\n");

  // Postscript: entities + low-mood terms
  const ents = entityImpacts(slice, prevSlice);
  if (ents.length) text += `\nEntity events: ${ents.join(" • ")}`;
  if (moodStatsPresent(slice)) {
    const low = lowMoodTerms(slice, -0.2);
    if (low.words?.length)
      text += `\nWhen mood dipped: ${low.words.map(([w]) => w).join(", ")}`;
  }

  // Replace legacy ID markers with snippets
  text = enrichDigestTextWithSnippets(text, slice);

  return text;
}

async function updateDigest(wk) {
  el.weeklyDigest.dataset.weekKey = wk;
  el.weeklyDigest.textContent = "Analysing themes…";

  const text = await generateCurrentDigest(wk);
  el.weeklyDigest.innerHTML = renderDigestHTML(text);

  const { start, end } = weekRangeFromKey(wk);
  el.digestDates.textContent = `${start.toDateString()} → ${end.toDateString()}`;
}

// ──────────────────────────────────────────────────────────────────────────────
function saveCurrentInsight() {
  const wk = el.weeklyDigest.dataset.weekKey;
  const text = (el.weeklyDigest.textContent || "").trim();
  if (!text || text.startsWith("No entries"))
    return showStatus("Nothing to save yet.", true);

  const insights = loadInsights();
  const dup = insights.find(
    (i) => i.scope === "week" && i.week === wk && i.text === text
  );
  if (dup) return showStatus("Already saved.", true);

  insights.unshift({
    id: crypto.randomUUID(),
    scope: "week",
    week: wk,
    text,
    createdAt: Date.now(),
  });
  saveInsights(insights);
  renderInsightsList();
  showStatus("Saved to Insights.");
}

function renderDigestHTML(text) {
  const lines = text.split("\n");

  const parts = {
    header: [],
    meta: [],
    themes: [],
    notables: [],
    evidence: [],
    entities: [],
  };

  for (const ln of lines) {
    if (ln.startsWith("Weekly Digest"))
      parts.header.push(`<h3 class="mono">${ln}</h3>`);
    else if (/^\w{3}\s/.test(ln) && ln.includes("→"))
      parts.header.push(`<div class="subtle">${ln}</div>`);
    else if (
      ln.startsWith("Entries:") ||
      ln.startsWith("Mood:") ||
      ln.startsWith("You wrote")
    )
      parts.meta.push(
        `<div><b>${ln.replace(/^(Entries:|Mood:)/, "$1")}</b></div>`
      );
    else if (ln.startsWith("Themes:")) {
      const pills = ln
        .replace("Themes:", "")
        .split(/[·,]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((t) => `<span class="theme-pill">${t}</span>`)
        .join("");
      parts.themes.push(`<div class="theme-line">${pills}</div>`);
    } else if (ln.startsWith("Notable ↓") || ln.startsWith("Notable −")) {
      parts.notables.push(
        `<div class="notable neg">${ln.replace(/^Notable [−↓]\s*/, "")}</div>`
      );
    } else if (ln.startsWith("Notable ↑") || ln.startsWith("Notable +")) {
      parts.notables.push(
        `<div class="notable pos">${ln.replace(/^Notable [↑+]\s*/, "")}</div>`
      );
    } else if (ln.startsWith("•")) {
      parts.evidence.push(`<div class="evidence">${ln}</div>`);
    } else if (ln.startsWith("Entity events:")) {
      const chips = ln
        .replace("Entity events:", "")
        .split("•")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((x) => `<span class="chip">${x}</span>`)
        .join(" ");
      parts.entities.push(`<div class="entities">${chips}</div>`);
    }
  }

  const metaBlock = parts.meta.length
    ? `<div class="digest-meta">${parts.meta.join("")}</div>`
    : "";

  return [
    parts.header.join(""),
    metaBlock,
    parts.themes.join(""),
    parts.notables.join(""),
    parts.evidence.join(""),
    parts.entities.join(""),
  ]
    .filter(Boolean)
    .join("\n");
}

async function askAIAboutDigest() {
  const text = (el.weeklyDigest.textContent || "").trim();
  console.log(text);
  if (!text || text.startsWith("No entries")) {
    return showStatus("No digest to analyze yet.", true);
  }

  try {
    const reply = await llmAsk({
      prompt: `You are my reflective coach. Here is my weekly digest. 
      Please keep your response concise and to the point.
${text}
Please:
1) surface 3 patterns with evidence,
2) ask one probing question, something to think about,
3) suggest one tiny next step per pattern.`,
    });

    const wk = el.weeklyDigest.dataset.weekKey;
    const insights = loadInsights();
    insights.unshift({
      id: crypto.randomUUID(),
      scope: "week-ai",
      week: wk,
      text: reply,
      createdAt: Date.now(),
    });

    saveInsights(insights);
    renderInsightsList();
    showStatus("AI response saved.");
  } catch (err) {
    showStatus("AI request failed: " + err.message, true);
  }
}

function renderInsightsList() {
  const insights = loadInsights();
  el.insightCount.textContent = `${insights.length} saved`;

  el.savedInsights.innerHTML = "";
  for (const it of insights) {
    const div = document.createElement("div");
    div.className = "entry";

    const date = new Date(it.createdAt).toLocaleString();
    const type = it.scope === "week-ai" ? " (AI Reflection)" : "";

    div.innerHTML = `
      <h4>${date}${type}</h4>
      <p style="white-space:pre-wrap; margin:10px 0">${it.text}</p>
      <div class="flex" style="margin-top:8px; gap:8px">
        <button class="secondary" data-open="${it.week}">Open week</button>
        <button class="secondary destructive" data-del="${it.id}">Delete</button>
        <div class="spacer"></div>
        <small class="subtle mono">week:${it.week}</small>
      </div>
    `;
    el.savedInsights.appendChild(div);
  }

  // Wire actions
  el.savedInsights.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-del");
      const insights = loadInsights().filter((x) => x.id !== id);
      saveInsights(insights);
      renderInsightsList();
      showStatus("Insight deleted.");
    };
  });

  el.savedInsights.querySelectorAll("button[data-open]").forEach((btn) => {
    btn.onclick = () => {
      const wk = btn.getAttribute("data-open");
      const { start, end } = weekRangeFromKey(wk);
      window.dispatchEvent(
        new CustomEvent("lightnote:showEntriesRange", {
          detail: { start: +start, end: +end },
        })
      );
      showStatus("Opened entries for that week.");
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Status helper
function showStatus(msg, isError = false) {
  if (!el.insightStatus) return;
  el.insightStatus.textContent = msg;
  el.insightStatus.style.color = isError ? "var(--red)" : "var(--muted)";
  setTimeout(() => (el.insightStatus.textContent = ""), 4000);
}

// ──────────────────────────────────────────────────────────────────────────────
// Event wiring (await async update)
if (el.prevWeek) {
  el.prevWeek.onclick = async () => {
    const curWeek = el.weeklyDigest.dataset.weekKey;
    await updateDigest(prevWeekKey(curWeek));
  };
}
if (el.thisWeek) {
  el.thisWeek.onclick = async () => {
    await updateDigest(weekKey(new Date()));
  };
}
if (el.saveInsight) el.saveInsight.onclick = saveCurrentInsight;
if (el.askAI) el.askAI.onclick = askAIAboutDigest;

if (el.clearInsights) {
  el.clearInsights.onclick = () => {
    if (confirm("Delete ALL saved insights? This cannot be undone.")) {
      saveInsights([]);
      renderInsightsList();
      showStatus("All insights cleared.");
    }
  };
}

// Optional buttons
if (el.openWeek) {
  el.openWeek.onclick = () => {
    const wk = el.weeklyDigest.dataset.weekKey;
    const { start, end } = weekRangeFromKey(wk);
    window.dispatchEvent(
      new CustomEvent("lightnote:showEntriesRange", {
        detail: { start: +start, end: +end },
      })
    );
  };
}
if (el.copyDigest) {
  el.copyDigest.onclick = async () => {
    const text = (el.weeklyDigest.textContent || "").trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    showStatus("Digest copied.");
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Init
async function initInsights() {
  await updateDigest(weekKey(new Date()));
  renderInsightsList();
}

export { initInsights };
