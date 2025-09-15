// Time-related utility functions
export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function mondayOfWeek(d) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  return x;
}

export function weekKey(d) {
  const date = new Date(d);
  // ISO week calc (Mon-based)
  const thurs = new Date(mondayOfWeek(date));
  thurs.setDate(thurs.getDate() + 3);
  const week1 = new Date(thurs.getFullYear(), 0, 4);
  const wk =
    1 +
    Math.round(
      ((thurs - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return `${thurs.getFullYear()}-W${String(wk).padStart(2, "0")}`;
}

export function weekRangeFromKey(k) {
  const [y, ww] = k.split("-W");
  const year = +y,
    w = +ww;
  // Monday of ISO week w
  const jan4 = new Date(year, 0, 4); // week 1 anchor
  const jan4Mon = mondayOfWeek(jan4);
  const start = new Date(jan4Mon);
  start.setDate(start.getDate() + (w - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function prevWeekKey(k) {
  const { start } = weekRangeFromKey(k);
  const prev = new Date(start);
  prev.setDate(prev.getDate() - 1);
  return weekKey(prev);
}
