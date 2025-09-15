// Stats and aggregation utilities for weekly insights

// --- stat utils ---
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const stdev = (a) => {
  const m = avg(a);
  return Math.sqrt(avg(a.map((x) => (x - m) ** 2)));
};

// Common English stop words to filter out
const STOP = new Set([
  "the",
  "and",
  "a",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "up",
  "about",
  "into",
  "over",
  "after",
]);

function tokens(t) {
  return t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

function topTerms(entries, k = 8) {
  const uni = new Map(),
    bi = new Map();
  for (const e of entries) {
    const tok = tokens(e.text || "");
    for (let i = 0; i < tok.length; i++) {
      uni.set(tok[i], (uni.get(tok[i]) || 0) + 1);
      if (i < tok.length - 1) {
        const b = tok[i] + " " + tok[i + 1];
        bi.set(b, (bi.get(b) || 0) + 1);
      }
    }
  }
  const take = (m) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([t, c]) => ({ t, c }));
  return { words: take(uni), phrases: take(bi) };
}

export function rollupWeek(entries) {
  if (!entries || !entries.length) return null;

  const MIN_WORDS = 3; // skip very short blurts

  const getScore = (e) =>
    typeof e?.meta?.sent?.compound === "number"
      ? e.meta.sent.compound
      : typeof e?.compound === "number"
      ? e.compound
      : null;

  const scores = [];
  let sum = 0;

  let longest = entries[0] || null;
  let mostNeg = null;
  let mostPos = null;

  for (const e of entries) {
    // skip entries with too few words for sentiment
    const wordCount = (e?.text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    if (wordCount < MIN_WORDS) continue;

    // track longest text
    if ((e?.text?.length || 0) > (longest?.text?.length || 0)) longest = e;

    // sentiment stats
    const s = getScore(e);
    if (s !== null) {
      scores.push(s);
      sum += s;
      if (!mostNeg || s < getScore(mostNeg)) mostNeg = e;
      if (!mostPos || s > getScore(mostPos)) mostPos = e;
    }
  }

  const count = entries.length;
  const hasMood = scores.length > 0;
  const moodAvg = hasMood ? sum / scores.length : 0;
  const moodVol = hasMood
    ? Math.sqrt(
        scores.reduce((acc, v) => acc + Math.pow(v - moodAvg, 2), 0) /
          scores.length
      )
    : 0;

  return {
    count,
    moodAvg, // weekly average (only from entries with ≥ MIN_WORDS)
    moodVol, // weekly volatility (stdev)
    longest: longest?.id || null,
    mostNeg: mostNeg ? { id: mostNeg.id, score: getScore(mostNeg) } : null,
    mostPos: mostPos ? { id: mostPos.id, score: getScore(mostPos) } : null,
  };
}

export function weeklyDigestText({ weekKey, range, cur, prev }) {
  const Δ = (a, b) => (b === 0 ? (a ? "+∞" : "0") : a - b);
  const dCount = Δ(cur.count, prev?.count || 0);
  const dMood = cur.moodAvg - (prev?.moodAvg ?? 0);
  const dVol = cur.moodVol - (prev?.moodVol ?? 0);

  // Analyze writing patterns by time
  function getWritingPattern(entries) {
    const patterns = entries.reduce((acc, e) => {
      const d = new Date(e.created);
      const day = d.toLocaleDateString("en-US", { weekday: "short" });
      const hour = d.getHours();
      const timeOfDay =
        hour < 12
          ? "morning"
          : hour < 17
          ? "afternoon"
          : hour < 21
          ? "evening"
          : "night";
      acc[`${day} ${timeOfDay}`] = (acc[`${day} ${timeOfDay}`] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(patterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([time, _]) => time)
      .join(" and ");
  }

  // Theme analysis
  const prevThemes = new Map(prev?.themes.words.map((x) => [x.t, x.c]) || []);
  const themeChanges = cur.themes.words
    .map((x) => {
      const prevCount = prevThemes.get(x.t) || 0;
      const delta = x.c - prevCount;
      return { word: x.t, count: x.c, delta };
    })
    .filter((x) => x.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const rising = themeChanges
    .filter((x) => x.delta > 0)
    .slice(0, 3)
    .map((x) => x.t);

  const falling = themeChanges
    .filter((x) => x.delta < 0)
    .slice(0, 3)
    .map((x) => x.t);

  // Entity analysis with context
  let significantEntity = null;
  const entities = Object.entries(cur.entities || {})
    .sort((a, b) => b[1].mentions - a[1].mentions)
    .map(([n, v]) => {
      const pv = prev?.entities?.[n];
      const mΔ = v.moodAvg - (pv?.moodAvg ?? 0);
      const cΔ = v.mentions - (pv?.mentions ?? 0);
      if (cΔ >= 3) {
        significantEntity = {
          name: n,
          mentions: v.mentions,
          delta: cΔ,
          mood: v.moodAvg,
          moodDelta: mΔ,
        };
      }
      return {
        name: n,
        mentions: v.mentions,
        delta: cΔ,
        mood: v.moodAvg,
        moodDelta: mΔ,
      };
    });

  // Find mood-correlated themes
  const moodDipThemes = cur.themes.words
    .filter((x) => x.c >= 2) // mentioned at least twice
    .slice(0, 3)
    .map((x) => x.t);

  const topWords = cur.themes.words
    .slice(0, 5)
    .map((x) => x.t)
    .join(", ");

  // Generate probing questions based on themes and mood
  const questions = [];
  if (rising.length > 0) {
    questions.push(`What did "${rising[0]}" actually mean to you this week?`);
  }
  if (dMood <= -0.3) {
    questions.push(`What would help you feel more grounded right now?`);
  }
  if (significantEntity) {
    questions.push(
      `What's one thing about ${significantEntity.name} you want to remember?`
    );
  }

  // Suggest tiny next steps
  let nextStep = "";
  if (falling.includes("sleep")) {
    nextStep =
      "Set a gentle bedtime reminder for 10:30pm; just notice if you follow it.";
  } else if (dMood <= -0.3) {
    nextStep =
      "Take a 10-minute walk after dinner on Wed/Fri; write one line about energy after.";
  } else {
    nextStep = `Notice when "${rising[0]}" comes up next; write what preceded it.`;
  }

  // Format entries for display
  const negEntry = cur.entries?.find((e) => e.id === cur.mostNegId)?.text;
  const posEntry = cur.entries?.find((e) => e.id === cur.mostPosId)?.text;

  // Truncate entries if they exist
  const truncatedNeg = negEntry ? negEntry.slice(0, 80) + "..." : null;
  const truncatedPos = posEntry ? posEntry.slice(0, 80) + "..." : null;

  // Build narrative digest
  return [
    `Weekly Digest — ${weekKey}`,
    `Entries: ${cur.count} (${dCount > 0 ? "↑" : "↓"} ${signed(
      dCount
    )}). Mood: ${fmt(cur.moodAvg)} (± ${fmt(cur.moodVol)})${
      dMood !== 0
        ? ` — ${dMood < 0 ? "down" : "up"} ${signed(dMood)} vs last week`
        : ""
    }.`,
    `You wrote mostly on ${getWritingPattern(cur.entries)}.`,
    rising.length || falling.length
      ? `Themes ${rising.length ? `up: ${rising.join(", ")}` : ""}${
          rising.length && falling.length ? ". " : ""
        }${falling.length ? `Themes down: ${falling.join(", ")}` : ""}.`
      : null,
    significantEntity
      ? `Entity event: ${significantEntity.name} mentioned ${
          significantEntity.mentions
        }× (↑ +${significantEntity.delta}). Avg mood ${fmt(
          significantEntity.mood
        )} (${signed(significantEntity.moodDelta)} vs last week).`
      : null,
    dMood <= -0.3
      ? `When mood dipped, you also wrote about: ${moodDipThemes.join(", ")}.`
      : null,
    truncatedNeg ? `Notable ↓ "${truncatedNeg}"` : null,
    truncatedPos ? `Notable ↑ "${truncatedPos}"` : null,
    `Questions: ${questions.slice(0, 2).join(" ")}`,
    `Next tiny step: ${nextStep}`,
  ]
    .filter(Boolean)
    .join("\n");
}

//  compound >= 0.05 ? '↑' :
//       compound <= -0.05 ? '↓' : '·';

function fmt(n) {
  return (n >= 0 ? "+" : "") + n.toFixed(2);
}

function signed(n, pad = false) {
  const s = (n > 0 ? "+" : "") + (typeof n === "number" ? n.toFixed(2) : n);
  return pad ? ` (${s})` : s;
}
