#!/usr/bin/env node
//
// Purpose: Fetch ollama.com/api/tags, detect models unknown to the heuristic
//          tables in index.ts, attempt to scrape library pages for context
//          windows, and auto-update index.ts if scrapes succeed.
//
// Usage:   node .github/scripts/refresh-models.mjs
// Env:     none required

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const TAGS_API = "https://ollama.com/api/tags";
const INDEX_PATH = "extensions/ollama-cloud/index.ts";

// ---------------------------------------------------------------------------
// Parse current heuristics from index.ts source
// ---------------------------------------------------------------------------

function readIndex() {
  return readFileSync(INDEX_PATH, "utf-8");
}

function parseExactTable(src) {
  const lines = src.split("\n");
  let inTable = false;
  let braceDepth = 0;
  const entries = [];
  let insertLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!inTable && l.includes("const EXACT_CONTEXT_WINDOWS")) {
      inTable = true;
      braceDepth = 0;
    }
    if (!inTable) continue;
    if (l.includes("{")) braceDepth++;
    if (l.includes("}")) {
      braceDepth--;
      if (braceDepth === 0) { insertLine = i - 1; break; }
    }
    const m = l.match(/"([^"]+)":\s*([\d_]+)/);
    if (m && braceDepth > 0) entries.push([m[1], Number(m[2].replace(/_/g, ""))]);
  }
  return { entries, insertLine };
}

function parsePrefixTable(src) {
  const lines = src.split("\n");
  let inTable = false;
  let entries = [];
  let insertLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!inTable && l.includes("const PREFIX_CONTEXT_WINDOWS")) {
      inTable = true;
    }
    if (!inTable) continue;
    // the table is a const [string, number][]; detect entries by ["pattern", num] syntax
    const m = l.match(/\[\s*"([^"]+)",\s*([\d_]+)\s*\]/);
    if (m) entries.push([m[1], Number(m[2].replace(/_/g, ""))]);
    // closing bracket
    if (l.trim() === "];" && entries.length > 0) {
      insertLine = i - 1;
      break;
    }
  }
  return { entries, insertLine };
}

function isCovered(id, exact, prefix) {
  if (exact.has(id)) return true;
  return prefix.some(([p]) => id.startsWith(p));
}

// ---------------------------------------------------------------------------
// Scrape context window from ollama library page
// ---------------------------------------------------------------------------

async function scrapeContextWindow(baseId) {
  const url = `https://ollama.com/library/${baseId}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return { value: null, source: null };
    const html = await resp.text();
    if (html.length < 200) return { value: null, source: null }; // SPA shell

    // Pattern: context metric row → the text-black span next to "context"
    const m = html.match(
      /x-test-model-metric="context"[^>]*>[\s\S]*?text-black[^>]*>([^<]+)<\/span>/
    );
    if (m) {
      const raw = m[1].trim();
      return { value: parseCw(raw), source: raw };
    }

    // Fallback: "context window" mention in body text
    const m2 = html.match(/context window[^.]*\b(\d+,?\d*)\s*(K|M)[^.]*tokens/i);
    if (m2) return { value: parseCw(m2[1] + m2[2]), source: m2[0] };

    return { value: null, source: null };
  } catch {
    return { value: null, source: null };
  }
}

function parseCw(s) {
  s = s.toUpperCase().replace(/,/g, "").trim();
  if (/^\d+K$/.test(s)) return parseInt(s) * 1000;
  if (/^\d+M$/.test(s)) return parseInt(s) * 1_000_000;
  if (/^\d+$/.test(s)) return parseInt(s);
  return null;
}

// ---------------------------------------------------------------------------
// Entry-by-entry scraping for hard-to-match model IDs
// The ollama library pages use different URL patterns — try variants.
// ---------------------------------------------------------------------------

async function scrapeWithFallbacks(modelId) {
  // Try exact model ID first (strip any :tag)
  const baseId = modelId.split(":")[0];
  let result = await scrapeContextWindow(baseId);
  if (result.value) return result;

  // For open-weight models with ":size" tags, the library page is often just the base
  // e.g., qwen3-coder:480b → qwen3-coder
  const shortBase = baseId.replace(/-?:\d+[bt]$/i, "");
  if (shortBase !== baseId) {
    result = await scrapeContextWindow(shortBase);
    if (result.value) return result;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Fetching /api/tags ...");
  const resp = await fetch(TAGS_API);
  if (!resp.ok) throw new Error(`/api/tags: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  const modelIds = data.models.map((m) => m.model);
  console.log(`${modelIds.length} models in catalog`);

  // Parse current index.ts heuristics
  const src = readIndex();
  const exactTable = parseExactTable(src);
  const prefixTable = parsePrefixTable(src);
  const exactSet = new Set(exactTable.entries.map(([id]) => id));

  console.log(
    `Tables: ${exactTable.entries.length} exact entries, ${prefixTable.entries.length} prefix entries`
  );

  // Find unknown models
  const unknown = modelIds.filter((id) => !isCovered(id, exactSet, prefixTable.entries));
  console.log(`Unknown context windows: ${unknown.length}`);

  if (unknown.length === 0) {
    console.log("All models covered.");
    return;
  }

  // Scrape unknowns
  const scraped = new Map();
  const failed = [];

  for (const id of unknown) {
    const result = await scrapeWithFallbacks(id);
    if (result.value) {
      scraped.set(id, result.value);
      console.log(`${result.source} → ${id}`);
    } else {
      failed.push(id);
      console.log(`  FAIL ${id}`);
    }
    // Be nice to the server
    await new Promise((r) => setTimeout(r, 300));
  }

  // Report failures for manual fix
  if (failed.length > 0) {
    const list = failed.map((id) => `- [${id}](https://ollama.com/library/${id.split(":")[0]})`).join("\n");
    console.error(`\n::warning title=Unresolved context windows::${failed.length} models need manual context-window entries:\n${list}`);
  }

  if (scraped.size === 0) {
    console.log("No context windows scraped — nothing to commit.");
    return;
  }

  // Build updated index.ts — insert into exact table
  let lines = src.split("\n");
  let insertIdx = exactTable.insertLine + 1;
  const newEntries = [];

  for (const [id, cw] of scraped) {
    const formatted = cw.toLocaleString("en-US").replace(/,/g, "_");
    const comment = cw >= 1_000_000
      ? ` // ${(cw / 1_000_000).toFixed(1)}M`
      : cw >= 1000
        ? ` // ${(cw / 1000).toFixed(0)}K`
        : "";
    const line = `  "${id}": ${formatted},${comment}`;
    lines.splice(insertIdx, 0, line);
    insertIdx++;
    newEntries.push(id);
  }

  writeFileSync(INDEX_PATH, lines.join("\n") + "\n");
  console.log(`Added ${newEntries.length} entries to EXACT_CONTEXT_WINDOWS`);

  // Commit
  execSync("git add " + INDEX_PATH, { stdio: "inherit" });
  try {
    execSync("git diff --cached --quiet", { stdio: "pipe" });
    console.log("No changes to commit.");
  } catch {
    const ids = newEntries.join(", ");
    execSync(`git commit -m "chore(ollama-cloud): add context windows for ${ids}"`, { stdio: "inherit" });
    execSync("git push", { stdio: "inherit" });
    console.log("Pushed.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
