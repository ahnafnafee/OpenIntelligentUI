export type Format = "number" | "integer" | "currency" | "percent";

// Displayed numbers are always rounded; non-finite values read as n/a.
export function fmt(value: number, format: Format = "number", unit?: string): string {
  if (!Number.isFinite(value)) return "n/a";
  let out: string;
  if (format === "currency") {
    const cents = Math.abs(value) < 100 && !Number.isInteger(value);
    out = value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  } else if (format === "percent") {
    out = `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  } else if (format === "integer") {
    out = Math.round(value).toLocaleString("en-US");
  } else {
    out = value.toLocaleString("en-US", { maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2 });
  }
  if (!unit || format === "percent") return out;
  // A short money magnitude reads as one token ($700bn); anything else is a separate word.
  return format === "currency" && /^[a-z]{1,2}$/i.test(unit) ? `${out}${unit}` : `${out} ${unit}`;
}

// ponytail: English regular plurals only (game, roll, toss, match); irregular nouns read oddly.
export const plural = (word: string) => (/(s|x|z|ch|sh)$/i.test(word) ? `${word}es` : `${word}s`);

// Round axis bounds and ticks to 1, 2, or 5 times a power of ten.
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}
