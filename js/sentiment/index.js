// js/sentiment/index.js
let worker;
let seq = 0;
const pending = new Map();

function spawn() {
  if (worker) return;
  worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e) => {
    const { id, ok, result, error } = e.data;
    const { resolve, reject } = pending.get(id) || {};
    pending.delete(id);
    ok ? resolve(result) : reject(new Error(error));
  };
}

export function analyzeSentiment(text) {
  spawn();
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, text });
  });
}
