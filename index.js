import "dotenv/config";
import fs from "fs";
import crypto from "crypto";

const TARGET_URL = process.env.TARGET_URL;
const PAGE_ID = process.env.FB_PAGE_ID;
const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

// ---------- helpers ----------
function sha(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync("state.json", "utf8"));
  } catch {
    return { lastHash: "" };
  }
}

function saveState(state) {
  fs.writeFileSync("state.json", JSON.stringify(state, null, 2));
}

async function fetchJsonText(url) {
  // Safety: user sometimes puts "TARGET_URL=..." in the value
  const cleanedUrl = String(url || "").replace(/^TARGET_URL=/i, "").trim();

  const res = await fetch(cleanedUrl, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; ChunabLiveBot/1.0)" }
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${text.slice(0, 200)}`);
  return text;
}

function parseElectionData(text) {
  const data = JSON.parse(text);

  // Your endpoint returns a pure array
  if (Array.isArray(data)) return data;

  // Fallback in case some endpoints wrap it
  if (Array.isArray(data?.rows)) return data.rows;

  throw new Error("Unknown election data format");
}

// ---------- formatting ----------
function summarizeRow(r) {
  const state = r.StateName || "—";
  const district = r.DistrictName || "";
  const party = r.PoliticalPartyName || "Independent";
  const candidate = r.CandidateName || "—";
  const symbol = r.SymbolName ? ` (${r.SymbolName})` : "";

  // ✅ Correct vote field from your screenshot
  const votes = r.TotalVoteReceived ?? 0;

  const rank = r.Rank ? `Rank: ${r.Rank}` : "";
  const remarks = r.Remarks ? `(${r.Remarks})` : "";

  const place = [state, district].filter(Boolean).join(" – ");

  return {
    // key used for change detection
    key: `${candidate}|${party}|${place}|${votes}|${r.Rank}|${r.Remarks}`,
    text:
      `📍 ${place}\n` +
      `👤 उम्मेदवार: ${candidate}\n` +
      `🏳️ पार्टी: ${party}${symbol}\n` +
      `🗳️ मत: ${votes}\n` +
      (rank || remarks ? `📊 ${[rank, remarks].filter(Boolean).join(" ")}` : "")
  };
}

function formatMessage(rows) {
  const body = rows.map((r) => r.text).join("\n\n");
  return `🗳️ ChunabLive – Election Update (2079)\n\n${body}\n\nSource: Election Commission of Nepal`;
}

// ---------- facebook ----------
async function postToFacebook(message) {
  const url = `https://graph.facebook.com/v21.0/${PAGE_ID}/feed`;

  const body = new URLSearchParams({
    message,
    access_token: PAGE_TOKEN
  });

  const res = await fetch(url, { method: "POST", body });
  const json = await res.json();

  if (!res.ok) throw new Error(`FB post failed: ${JSON.stringify(json)}`);
  return json;
}

// ---------- main ----------
async function main() {
  if (!TARGET_URL || !PAGE_ID || !PAGE_TOKEN) {
    throw new Error("Missing env vars: TARGET_URL, FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN");
  }

  const state = loadState();

  const text = await fetchJsonText(TARGET_URL);
  const all = parseElectionData(text);

  // ✅ For now: post top 3 entries (you can change to 5/10)
  const summarized = all.slice(0, 3).map(summarizeRow);

  // Hash only meaningful content to avoid duplicates
  const currentHash = sha(JSON.stringify(summarized.map((x) => x.key)));

  if (currentHash === state.lastHash) {
    console.log("No change detected. Skipping post.");
    return;
  }

  const result = await postToFacebook(formatMessage(summarized));
  console.log("Posted:", result);

  state.lastHash = currentHash;
  saveState(state);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
