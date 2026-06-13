// ===== モード管理 =====
// "basic"         : rules.json の確定リストのみブロック
// "extended"      : 確定リスト + スコアリングで「広告」と強く推定されるドメインをブロック（誤検知を避ける慎重判定）
// "extended_plus" : 確定リスト + 閾値を下げた積極判定（多少の誤爆を許容し検知漏れを避ける）
// "off"           : ブロック・検知をすべて停止
//
// 設定（mode / disabledSites）はすべて chrome.storage.local に保存され、ブラウザを閉じても保持される。

// rules.json と同一のブロック対象ドメイン集合（self.BLOCK_DOMAINS）を読み込む。
// カウント判定の精度向上のため使用。読み込み失敗時も動作は継続する。
try {
  importScripts("blocklist.js");
} catch (e) {
  self.BLOCK_DOMAINS = new Set();
}

// ---- ドメイン名の「広告っぽさ」パターン（各ヒットでスコア加算）----
const SUSPICIOUS_PATTERNS = [
  /(^|\.)ads?[\.\-]/i,
  /(^|\.)adserver/i,
  /(^|\.)adservice/i,
  /(^|\.)advert/i,
  /(^|\.)track(ing|er)?[\.\-]/i,
  /(^|\.)pixel[\.\-]/i,
  /(^|\.)analytics[\.\-]/i,
  /(^|\.)\w*sync\d*\./i,
  /(^|\.)metrics?[\.\-]/i,
  /(^|\.)telemetry/i,
  /(^|\.)affiliate/i,
  /\bdsp\b/i,
  /\bssp\b/i,
  /\brtb\b/i,
  /adservice\.google/i,
  /^\d+\.[a-z0-9-]*(loader|fill|feed|deliver|reward)/i,
  /(loader|adfeed|admax|adserve)\.com$/i
];

// ---- 広告系を強く示すキーワード（登録ドメイン名に含まれる場合に加点）----
const AD_KEYWORDS = [
  "adserver","adservice","adsystem","adnetwork","admanager","adexchange",
  "advertising","advertis","banner","popunder","popad","sponsor","promoted",
  "doubleclick","syndication","adtech","adroll","adform","adcolony"
];

// ---- 正規サービスのホワイトリスト（広告っぽい名前でもブロックしない）----
// ここに該当する登録ドメインは拡張・拡張+どちらでも絶対にブロックしない
const WHITELIST = [
  "google.com","googleapis.com","gstatic.com","googleusercontent.com",
  "cloudflare.com","cloudflare.net","cloudfront.net","jsdelivr.net","unpkg.com",
  "cdnjs.cloudflare.com","fontawesome.com","jquery.com","bootstrapcdn.com",
  "github.com","githubusercontent.com","githubassets.com","gitlab.com",
  "microsoft.com","windows.net","azureedge.net","office.com","live.com",
  "apple.com","icloud.com","mzstatic.com",
  "amazonaws.com","akamai.net","akamaihd.net","akamaized.net","fastly.net",
  "wikipedia.org","wikimedia.org","mozilla.org","mozilla.net",
  "youtube.com","ytimg.com","ggpht.com","vimeo.com",
  "twitter.com","twimg.com","x.com","facebook.com","fbcdn.net","instagram.com",
  "yahoo.co.jp","yimg.jp","line.me","linecorp.com","rakuten.co.jp",
  "paypal.com","stripe.com","recaptcha.net","gstatic.cn",
  "typekit.net","fonts.net","cookielaw.org","onetrust.com"
];

// ---- rules.json と同じ確定ブロック対象（JS側でも判定・カウント用）----
const HOST_BLOCK_LIST = [
  "doubleclick.net","googlesyndication.com","googleadservices.com",
  "googletagservices.com","adnxs.com","amazon-adsystem.com","criteo.com",
  "criteo.net","moatads.com","scorecardresearch.com","imasdk.googleapis.com",
  "pubmatic.com","rubiconproject.com","openx.net","taboola.com","outbrain.com",
  "html-load.com","ad-delivery.net","btloader.com","zucks.net","geniee.jp",
  "uncn.jp","popin.cc","yads.c.yimg.jp","smartadserver.com","audiencedata.net",
  "company-target.com","flux.jp","flux-cdn.com","intentiq.com","browsiprod.com",
  "sp-gn.com","dns-finder.com","rewardingfill.com","microad.jp","im-apps.net",
  "everesttech.net","content-loader.com","adservice.google","googletagmanager.com",
  "google-analytics.com","adservices.google","ad.google.com"
];

const PATH_BLOCK_PATTERNS = [
  /googlevideo\.com\/videoplayback.*ctier/i,
  /youtube\.com\/api\/stats\/ads/i,
  /youtube\.com\/pagead\//i,
  /youtube\.com\/ptracking/i,
  /youtube\.com\/get_midroll/i,
  /nicovideo\.jp\/api\/ad/i,
  /nicovideo\.jp\/ads\//i,
  /ad\.nicovideo\.jp/i,
  /nicovideo\.jp.*\/dwango_ad/i
];

// 広告で特に多いリソース種別
const AD_LIKELY_RESOURCE = ["script","sub_frame","image"];

const DEFAULT_MODE = "basic";

// 拡張モードのスコア閾値
const THRESHOLD = {
  extended: 4,        // 慎重：複数シグナルが揃った時だけ
  extended_plus: 2    // 積極：弱いシグナルでも拾う
};

// タブごとの集計
const blockedCountByTab = {};
const detectedByTab = {};

let dynamicBlockedHosts = new Set();
let currentMode = DEFAULT_MODE;

// ---- ユーティリティ ----
function getRegisteredDomain(host) {
  // 簡易版：末尾2ラベル（co.jp等の2段TLDは3ラベル）を登録ドメインとみなす
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const twoLevelTld = ["co.jp","ne.jp","or.jp","go.jp","ac.jp","ad.jp","ed.jp",
    "co.uk","org.uk","gov.uk","com.au","co.kr","com.cn","com.br","com.tw"];
  const last2 = parts.slice(-2).join(".");
  const last3 = parts.slice(-3).join(".");
  if (twoLevelTld.includes(last2)) return last3;
  return last2;
}

function isWhitelisted(host) {
  return WHITELIST.some(d => host === d || host.endsWith("." + d));
}

function isHostBlocked(host) {
  // 大規模ブロックリスト（blocklist.js）で登録ドメイン単位の一致を確認
  if (self.BLOCK_DOMAINS && self.BLOCK_DOMAINS.size > 0) {
    // host とその親ドメインを順に確認（sub.ads.com → ads.com まで）
    const parts = host.split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      const candidate = parts.slice(i).join(".");
      if (self.BLOCK_DOMAINS.has(candidate)) return true;
    }
  }
  // 従来の代表リストも確認
  return HOST_BLOCK_LIST.some(d => host === d || host.endsWith("." + d) || host.includes(d));
}

function isPathBlocked(url) {
  return PATH_BLOCK_PATTERNS.some(re => re.test(url));
}

function isConfirmedBlocked(host, url) {
  return isHostBlocked(host) || isPathBlocked(url);
}

// 文字列のシャノンエントロピー（ランダム自動生成ドメイン検出用）
function shannonEntropy(str) {
  const len = str.length;
  if (len === 0) return 0;
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  let ent = 0;
  for (const k in freq) {
    const p = freq[k] / len;
    ent -= p * Math.log2(p);
  }
  return ent;
}

// 母音を含まない長い子音連続 = 人工的なドメイン名の兆候
function hasLongConsonantRun(str) {
  return /[bcdfghjklmnpqrstvwxz]{5,}/i.test(str);
}

// ---- スコアリング本体 ----
// details: webRequestのリクエスト情報、pageHost: 開いているページのホスト
function scoreDomain(host, details, pageHost) {
  if (isWhitelisted(host)) return -999; // 正規サービスは即除外

  let score = 0;
  const reg = getRegisteredDomain(host);
  const regName = reg.split(".")[0] || "";

  // 1. ドメイン名パターン一致
  for (const re of SUSPICIOUS_PATTERNS) {
    if (re.test(host)) { score += 2; break; }
  }

  // 2. 広告キーワードを含む
  if (AD_KEYWORDS.some(k => host.includes(k))) score += 2;

  // 3. サードパーティ（ページのドメインと登録ドメインが異なる）
  if (pageHost) {
    const pageReg = getRegisteredDomain(pageHost);
    if (pageReg && pageReg !== reg) score += 1;
  }

  // 4. 広告で多いリソース種別
  if (details && AD_LIKELY_RESOURCE.includes(details.type)) score += 1;

  // 5. ランダム生成ドメインの疑い（エントロピー高 or 長い子音連続）
  //    例: endlesshandbaglinked.com, xn--... のような自動生成名
  if (regName.length >= 10) {
    if (shannonEntropy(regName) > 3.5) score += 1;
    if (hasLongConsonantRun(regName)) score += 1;
  }

  // 6. 怪しいTLD（広告/詐欺で多用される新興gTLD）
  if (/\.(cfd|sbs|top|xyz|click|life|fit|icu|rest|monster|quest)$/i.test(host)) score += 1;

  return score;
}

// 旧来の「怪しい」判定（検知リスト表示用。確定ブロックでないもの）
function looksSuspicious(host) {
  if (isConfirmedBlocked(host, "")) return false;
  if (isWhitelisted(host)) return false;
  return SUSPICIOUS_PATTERNS.some(re => re.test(host));
}

// ---- 起動時のモード読み込み ----
chrome.storage.local.get(["mode"], (data) => {
  currentMode = data.mode || DEFAULT_MODE;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.mode) {
    currentMode = changes.mode.newValue || DEFAULT_MODE;
    // 拡張系モード以外に切り替えたら動的ルールをクリア
    if (currentMode !== "extended" && currentMode !== "extended_plus") {
      clearDynamicRules();
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) syncRulesetForTab(tabs[0].id);
    });
  }
  if (changes.disabledSites) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) syncRulesetForTab(tabs[0].id);
    });
  }
});

// ---- ページホストの記録（サードパーティ判定用） ----
const pageHostByTab = {};
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    try {
      pageHostByTab[details.tabId] = new URL(details.url).hostname;
    } catch (e) {}
  }
});

// ===== webRequest: カウント + 検知 + 拡張系モードでの動的ブロック =====
chrome.webRequest.onBeforeRequest.addListener(
  (details) => { handleRequest(details); },
  { urls: ["<all_urls>"] }
);

function handleRequest(details) {
  if (currentMode === "off") return;

  const tabId = details.tabId;
  if (tabId < 0) return;

  let host;
  try { host = new URL(details.url).hostname; } catch (e) { return; }

  // 確定ブロック対象はカウント
  if (isConfirmedBlocked(host, details.url)) {
    blockedCountByTab[tabId] = (blockedCountByTab[tabId] || 0) + 1;
    return;
  }

  const isExtended = (currentMode === "extended" || currentMode === "extended_plus");
  if (!isExtended) return;

  if (isWhitelisted(host)) return;

  // スコアリング
  const pageHost = pageHostByTab[tabId];
  const score = scoreDomain(host, details, pageHost);
  const threshold = THRESHOLD[currentMode];

  if (score >= threshold) {
    // 推定広告：動的ブロックに追加してカウント
    if (!dynamicBlockedHosts.has(host)) {
      addDynamicBlockRule(host);
    }
    blockedCountByTab[tabId] = (blockedCountByTab[tabId] || 0) + 1;

    if (!detectedByTab[tabId]) detectedByTab[tabId] = new Set();
    detectedByTab[tabId].add(host);
  } else if (score >= 1) {
    // 閾値未満だが多少怪しい → 検知リストにのみ表示（ブロックしない）
    if (!detectedByTab[tabId]) detectedByTab[tabId] = new Set();
    detectedByTab[tabId].add(host);
    chrome.action.setBadgeText({ tabId, text: String(detectedByTab[tabId].size) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#f0a020" });
  }
}

// ===== 動的ルール管理 =====
const DYNAMIC_RULE_ID_BASE = 10000;

async function addDynamicBlockRule(host) {
  if (dynamicBlockedHosts.has(host)) return;
  dynamicBlockedHosts.add(host);
  const id = DYNAMIC_RULE_ID_BASE + (dynamicBlockedHosts.size % 4000);
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [id],
      addRules: [{
        id, priority: 1, action: { type: "block" },
        condition: {
          requestDomains: [host],
          resourceTypes: ["script","image","sub_frame","xmlhttprequest","media","font","object","ping"]
        }
      }]
    });
  } catch (e) {}
}

async function clearDynamicRules() {
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const ids = existing.map(r => r.id);
    if (ids.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
    }
  } catch (e) {}
  dynamicBlockedHosts = new Set();
}

// ===== タブ管理 =====
chrome.tabs.onRemoved.addListener((tabId) => {
  delete detectedByTab[tabId];
  delete blockedCountByTab[tabId];
  delete pageHostByTab[tabId];
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    delete detectedByTab[details.tabId];
    delete blockedCountByTab[details.tabId];
    chrome.action.setBadgeText({ tabId: details.tabId, text: "" });
  }
});

// ===== サイト別有効/無効 + モードによる ruleset 制御 =====
async function syncRulesetForTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) return;
    const host = new URL(tab.url).hostname;

    const data = await chrome.storage.local.get(["disabledSites", "mode"]);
    const disabled = data.disabledSites || [];
    const mode = data.mode || DEFAULT_MODE;
    currentMode = mode;

    const siteDisabled = disabled.some(d => host === d || host.endsWith("." + d));
    const shouldEnable = (mode !== "off") && !siteDisabled;

    try {
      if (shouldEnable) {
        await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ["ruleset_1"] });
      } else {
        await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ["ruleset_1"] });
      }
    } catch (e) {}
  } catch (e) {}
}

chrome.tabs.onActivated.addListener((activeInfo) => { syncRulesetForTab(activeInfo.tabId); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.active) syncRulesetForTab(tabId);
});

// ===== popup.js との通信 =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_TAB_INFO") {
    const tabId = msg.tabId;
    const suspicious = detectedByTab[tabId] ? Array.from(detectedByTab[tabId]) : [];
    sendResponse({ suspicious, blockedCount: blockedCountByTab[tabId] || 0 });
    return true;
  }
  if (msg.type === "GET_MODE") {
    chrome.storage.local.get(["mode"], (data) => sendResponse({ mode: data.mode || DEFAULT_MODE }));
    return true;
  }
  if (msg.type === "SET_MODE") {
    currentMode = msg.mode;
    chrome.storage.local.set({ mode: msg.mode }, () => sendResponse({ ok: true }));
    return true;
  }
});
