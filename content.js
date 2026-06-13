// ===== 悪質な広告UI対策 =====
// 「アドブロック検知」自体を回避するものではない。
// ページ内に存在する、ユーザー操作を妨害する系の広告UIパターンを
// 無効化する。

(function () {
  "use strict";

  // モード + サイトごとの無効化設定を確認
  chrome.storage.local.get(["disabledSites", "mode"], (data) => {
    const mode = data.mode || "basic";
    if (mode === "off") return; // オフモードでは何もしない

    const disabled = data.disabledSites || [];
    const host = location.hostname;
    if (disabled.some(d => host === d || host.endsWith("." + d))) {
      return; // このサイトでは何もしない
    }
    run();
  });

  function run() {
    // --- 1. マウスカーソル追従型の要素を無効化 ---
    // position:fixed/absolute かつ非常に高いz-indexで、
    // mousemoveに応じて自分の位置を書き換えるような要素は
    // 「クリックを誘導する追従広告」の典型パターン。
    // ここでは pointer-events を切ることで、クリックを奪われないようにする。
    const style = document.createElement("style");
    style.textContent = `
      /* 全画面を覆う高z-indexのオーバーレイ系要素のクリックを無効化 */
      [style*="z-index: 999"], [style*="z-index:999"],
      [style*="z-index: 9999"], [style*="z-index:9999"],
      [style*="z-index: 2147483647"] {
        pointer-events: none !important;
      }
    `;
    document.documentElement.appendChild(style);

    // --- 2. mousemoveに合わせて自身を移動させる要素を監視・無効化 ---
    let suspiciousMoveCount = new WeakMap();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" &&
            (m.attributeName === "style" || m.attributeName === "class")) {
          const el = m.target;
          if (!(el instanceof HTMLElement)) continue;

          const cs = getComputedStyle(el);
          const isOverlay = (cs.position === "fixed" || cs.position === "absolute");
          const highZ = parseInt(cs.zIndex || "0", 10) > 1000;

          if (isOverlay && highZ) {
            const count = (suspiciousMoveCount.get(el) || 0) + 1;
            suspiciousMoveCount.set(el, count);

            // 短時間に何度も位置/スタイルが変わる = マウス追従の疑い
            if (count > 5) {
              el.style.setProperty("pointer-events", "none", "important");
              el.style.setProperty("display", "none", "important");
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ["style", "class"]
    });

    // 30秒後に監視終了（パフォーマンス対策）
    setTimeout(() => observer.disconnect(), 30000);

    // --- 3. ページ全体を覆う透明クリックトラップ要素を除去 ---
    // 画面サイズに近い透明 div で、リンク以外の場所に置かれているものを検出
    function removeClickTraps() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      document.querySelectorAll("div, a, ins, iframe").forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.position !== "fixed" && cs.position !== "absolute") return;

        const rect = el.getBoundingClientRect();
        const coversScreen = rect.width >= vw * 0.9 && rect.height >= vh * 0.9;
        const isTransparent = (cs.opacity === "0" || cs.backgroundColor === "rgba(0, 0, 0, 0)")
          && cs.pointerEvents !== "none";
        const highZ = parseInt(cs.zIndex || "0", 10) > 1000;

        if (coversScreen && highZ && (isTransparent || el.tagName === "INS")) {
          // game8等の正規コンテンツを壊さないよう、リンクテキストを持たない
          // 純粋なクリックトラップらしき要素のみ対象
          if (!el.textContent || el.textContent.trim().length < 2) {
            el.style.setProperty("pointer-events", "none", "important");
          }
        }
      });
    }

    // 初回 + 動的に追加される広告に対応するため数回実行
    removeClickTraps();
    setTimeout(removeClickTraps, 1000);
    setTimeout(removeClickTraps, 3000);
    setTimeout(removeClickTraps, 6000);
  }
})();
