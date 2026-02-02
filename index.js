import fs from "fs";
import crypto from "crypto";
import * as cheerio from "cheerio";

const TARGET_URL = process.env.TARGET_URL;
const PAGE_ID = process.env.FB_PAGE_ID;
const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

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

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; ChunabLiveBot/1.0)" }
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  return await res.text();
}

function extractData(html) {
  const $ = cheerio.load(html);

  // TEMP: pick something visible
  const title = $("title").text().trim();
  const snippet = $("body").text().replace(/\s+/g, " ").slice(0, 220).trim();

  return { title, snippet };
}

function formatMessage(data) {
  return `🗳️ ChunabLive Update\n${data.title}\n\n${data.snippet}\n\nSource: Election Commission of Nepal`;
}

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

async function main() {
  if (!TARGET_URL || !PAGE_ID || !PAGE_TOKEN) {
    throw new Error("Missing env vars: TARGET_URL, FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN");
  }

  const state = loadState();

  const html = await fetchHtml(TARGET_URL);
  const data = extractData(html);

  const currentHash = sha(JSON.stringify(data));
  if (currentHash === state.lastHash) {
    console.log("No change detected. Skipping post.");
    return;
  }

  const result = await postToFacebook(formatMessage(data));
  console.log("Posted:", result);

  state.lastHash = currentHash;
  saveState(state);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
