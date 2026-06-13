let currentHost = null;
let currentTabId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTabId = tab.id;
    try {
      currentHost = tab.url ? new URL(tab.url).hostname : null;
    } catch (e) {
      currentHost = null;
    }
  }

  document.getElementById("siteHost").textContent = currentHost || "（このページでは無効）";

  // ===== モード初期化（storageから直接読み込み・確実に保持） =====
  chrome.storage.local.get(["mode"], (data) => {
    const mode = data.mode || "basic";
    const radio = document.querySelector(`input[name="mode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    updateUIForMode(mode);
    updateSiteToggleAvailability(mode);
  });

  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (!e.target.checked) return;
      const mode = e.target.value;
      chrome.storage.local.set({ mode }, () => {
        updateUIForMode(mode);
        updateSiteToggleAvailability(mode);
        reloadAfterSync();
      });
    });
  });

  // ===== サイトごとの有効/無効 =====
  chrome.storage.local.get(["disabledSites"], (data) => {
    const disabled = data.disabledSites || [];
    const isDisabled = currentHost && disabled.includes(currentHost);
    document.getElementById("siteEnabledToggle").checked = !isDisabled;
  });

  document.getElementById("siteEnabledToggle").addEventListener("change", (e) => {
    if (!currentHost) return;
    chrome.storage.local.get(["disabledSites"], (data) => {
      let disabled = data.disabledSites || [];
      if (e.target.checked) {
        disabled = disabled.filter(h => h !== currentHost);
      } else {
        if (!disabled.includes(currentHost)) disabled.push(currentHost);
      }
      chrome.storage.local.set({ disabledSites: disabled }, () => {
        reloadAfterSync();
      });
    });
  });

  // ===== ブロック数 / 検知ドメイン =====
  if (currentTabId != null) {
    chrome.runtime.sendMessage({ type: "GET_TAB_INFO", tabId: currentTabId }, (res) => {
      if (!res) return;

      document.getElementById("blockedCount").textContent = res.blockedCount ?? 0;
      document.getElementById("suspiciousCount").textContent = (res.suspicious || []).length;

      const list = document.getElementById("suspiciousList");
      list.innerHTML = "";

      if (!res.suspicious || res.suspicious.length === 0) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "検知なし";
        list.appendChild(li);
        return;
      }

      res.suspicious.forEach((host) => {
        const li = document.createElement("li");
        li.textContent = host;
        list.appendChild(li);
      });
    });
  }
});

function updateUIForMode(mode) {
  const desc = document.getElementById("suspiciousDesc");
  const label = document.getElementById("suspiciousLabel");

  if (mode === "extended") {
    desc.textContent = "拡張モードでは、スコア判定で広告と強く推定されたドメインを自動ブロックしています（慎重判定）。";
    label.innerHTML = "怪しい通信<br>(自動ブロック中)";
  } else if (mode === "extended_plus") {
    desc.textContent = "拡張+モードでは、判定を緩めて広く推定ブロックしています（積極判定・多少の誤爆あり）。";
    label.innerHTML = "怪しい通信<br>(自動ブロック中)";
  } else if (mode === "off") {
    desc.textContent = "オフのため、検知は行われていません。";
    label.innerHTML = "怪しい通信<br>(検知停止中)";
  } else {
    desc.textContent = "確定リストには無いが、名前のパターンから広告/トラッキングの可能性があるドメインです。誤動作防止のため自動ではブロックしていません。";
    label.innerHTML = "怪しい通信<br>(未ブロック)";
  }
}

// オフモードでは「このサイトで保護を有効にする」スイッチは意味を持たないため
// 無効化してグレーアウトし、状態がオフであることを明示する
function updateSiteToggleAvailability(mode) {
  const toggle = document.getElementById("siteEnabledToggle");
  const wrapper = document.querySelector(".site-toggle");
  const note = document.querySelector(".site-toggle-note");

  if (!currentHost) {
    // chrome://newtab 等、対象URLが無いページではトグル自体を意味のない状態にする
    toggle.disabled = true;
    wrapper.classList.add("disabled-by-mode");
    if (note) note.textContent = "※このページには適用されません";
    return;
  }

  if (mode === "off") {
    toggle.disabled = true;
    wrapper.classList.add("disabled-by-mode");
    if (note) note.textContent = "※オフ中はこの設定は無視されます";
  } else {
    toggle.disabled = false;
    wrapper.classList.remove("disabled-by-mode");
    if (note) note.textContent = "※切り替えるとページが再読み込みされます";
  }
}

// background側のruleset同期(syncRulesetForTab)が
// storage.onChangedを受けて完了するのを少し待ってからリロードする。
// 即時リロードだと、ruleset切替が反映される前に再読込されることがある。
function reloadAfterSync() {
  if (!currentTabId) return;
  setTimeout(() => {
    chrome.tabs.reload(currentTabId);
  }, 150);
}
