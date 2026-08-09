/**
 * Runs Lighthouse against a URL on the default MOBILE preset and reports the
 * median of N runs.
 *
 *   node scripts/perf/lighthouse.mjs http://perf-lab.localhost:3200/ --runs=3 --label=grid-90
 *
 * Three runs because a single Lighthouse run is noise, not a measurement: the
 * same page on the same machine varies by several points between runs.
 *
 * The default preset is NOT loosened. ">= 95 mobile" in the roadmap means the
 * default mid-tier phone on slow 4G, and a number taken under any other
 * throttle cannot be compared against it.
 *
 * Chrome specifically: *.localhost resolves in Chrome only, so Node and
 * Playwright's request fixture cannot reach these hosts -- but a real Chrome
 * maps the whole TLD to loopback, which is why this script drives one.
 */
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { mkdir, rm, writeFile } from "node:fs/promises";

const url = process.argv[2];
if (!url || url.startsWith("--")) {
  console.error(
    "Usage: node scripts/perf/lighthouse.mjs <url> [--runs=N] [--label=name]",
  );
  process.exit(1);
}

const flag = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ??
  fallback;

const runs = Number(flag("runs", 3));
const label = flag("label", "run");

/*
 * --cold clears the Next image-optimizer cache before EVERY run, not once
 * before the batch.
 *
 * Clearing it once makes run 1 cold and runs 2 and 3 warm, so the median is a
 * warm number wearing a cold label. That is not a hypothetical: the font fix
 * measured 87, 97, 97 that way, and the 87 was the only honest cold reading in
 * the set.
 */
const cold = process.argv.includes("--cold");

const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new", "--no-sandbox"],
});

const results = [];
try {
  for (let i = 0; i < runs; i += 1) {
    if (cold) await rm(".next/cache/images", { recursive: true, force: true });
    const started = Date.now();
    const { lhr } = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance"],
    });
    const score = Math.round(lhr.categories.performance.score * 100);
    console.log(
      `run ${i + 1}/${runs}: ${score}  (${Math.round((Date.now() - started) / 1000)}s)`,
    );
    results.push(lhr);
  }
} finally {
  await chrome.kill();
}

const scores = results.map((r) =>
  Math.round(r.categories.performance.score * 100),
);
const median = [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)];
const medianRun = results[scores.indexOf(median)];

const metric = (id) => medianRun.audits[id]?.displayValue ?? "n/a";

console.log(`\n=== ${label} (${cold ? "COLD, cache cleared each run" : "warm"}) ===`);
console.log(`scores: ${scores.join(", ")}   MEDIAN: ${median}`);
console.log(`  FCP         ${metric("first-contentful-paint")}`);
console.log(`  LCP         ${metric("largest-contentful-paint")}`);
console.log(`  TBT         ${metric("total-blocking-time")}`);
console.log(`  CLS         ${metric("cumulative-layout-shift")}`);
console.log(`  Speed Index ${metric("speed-index")}`);

console.log("\nfailing audits and opportunities:");
const failing = Object.values(medianRun.audits)
  .filter((a) => a.score !== null && a.score < 0.9)
  .sort(
    (a, b) =>
      (b.details?.overallSavingsMs ?? 0) - (a.details?.overallSavingsMs ?? 0),
  );

if (failing.length === 0) console.log("  (none)");
for (const audit of failing) {
  const saving = audit.details?.overallSavingsMs;
  console.log(
    `  [${audit.score.toFixed(2)}] ${audit.title}` +
      `${audit.displayValue ? ` — ${audit.displayValue}` : ""}` +
      `${saving ? ` (saves ~${Math.round(saving)} ms)` : ""}`,
  );
}

// The LCP element by name, because "which image is the largest paint" is the
// question that decides where `priority` belongs.
const lcpElement = medianRun.audits["largest-contentful-paint-element"];
if (lcpElement?.details?.items?.[0]?.items?.[0]?.node) {
  console.log(`\nLCP element: ${lcpElement.details.items[0].items[0].node.snippet}`);
}

const totalBytes = medianRun.audits["total-byte-weight"];
if (totalBytes) console.log(`Total page weight: ${totalBytes.displayValue}`);

await mkdir("docs/perf", { recursive: true });
await writeFile(
  `docs/perf/${label}.json`,
  JSON.stringify(
    {
      url,
      label,
      measuredAt: new Date().toISOString(),
      scores,
      median,
      metrics: {
        fcp: metric("first-contentful-paint"),
        lcp: metric("largest-contentful-paint"),
        tbt: metric("total-blocking-time"),
        cls: metric("cumulative-layout-shift"),
        speedIndex: metric("speed-index"),
      },
      failing: failing.map((a) => ({
        id: a.id,
        title: a.title,
        score: a.score,
        displayValue: a.displayValue,
        savingsMs: a.details?.overallSavingsMs ?? null,
      })),
    },
    null,
    2,
  ),
);
console.log(`\nWrote docs/perf/${label}.json`);

process.exit(median >= 95 ? 0 : 1);
