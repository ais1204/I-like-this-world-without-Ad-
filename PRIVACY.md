# プライバシーポリシー / Privacy Policy

**拡張機能名 / Extension:** I like this world (without Ad)
**最終更新 / Last updated:** 2026-06-19

## 日本語

本拡張機能は、ユーザーのプライバシーを最優先に設計されています。

### 収集しないもの
- 閲覧履歴、アクセスしたURL、ページの内容を**収集・保存・送信しません**。
- 個人情報(氏名・メールアドレス・位置情報など)を**一切取得しません**。
- 入力内容、Cookie、認証情報を**取得しません**。
- 拡張機能はいかなる外部サーバーとも通信しません(解析・トラッキング・広告SDKを含みません)。

### ローカルに保存される情報
以下の設定のみ、ユーザーの端末内(`chrome.storage.local`)に保存されます。外部には送信されません。
- 選択中の動作モード(基本 / 拡張 / 拡張+ / オフ)
- 広告ブロックを無効化したサイトの一覧(ユーザーが自分で指定したもの)

これらはブラウザのローカルストレージにのみ存在し、拡張機能を削除すると消去されます。

### 権限の利用目的
- **ページ内の通信の監視(webRequest / webNavigation):** 広告・トラッキングドメインかどうかを端末内で判定し、ブロック数を数えるためにのみ使用します。通信内容を保存・送信することはありません。
- **全サイトへのアクセス(host permissions):** 広告は任意のサイトで読み込まれるため、すべてのサイトでブロックを機能させる目的でのみ使用します。

### 第三者への提供
収集データが存在しないため、第三者への販売・提供は一切ありません。

### お問い合わせ
ご質問は GitHub リポジトリの Issue までお寄せください。

---

## English

This extension is designed with user privacy as the top priority.

### What we do NOT collect
- We do **not** collect, store, or transmit your browsing history, visited URLs, or page content.
- We do **not** collect any personal information (name, email, location, etc.).
- We do **not** access your inputs, cookies, or credentials.
- The extension does **not** communicate with any external server (no analytics, tracking, or advertising SDKs).

### Information stored locally
Only the following settings are stored on your own device (`chrome.storage.local`) and are never transmitted:
- The currently selected mode (basic / extended / extended+ / off)
- The list of sites where you have disabled ad blocking (set by you)

This data exists only in your browser's local storage and is removed when you uninstall the extension.

### Why permissions are used
- **Request observation (webRequest / webNavigation):** Used solely to determine, locally on your device, whether a request is to an ad/tracking domain and to count blocked requests. Request contents are never stored or transmitted.
- **Access to all sites (host permissions):** Ads can load on any site, so this is used only to make blocking work across all websites.

### Sharing with third parties
Because no data is collected, none is ever sold or shared.

### Contact
Please open an issue on the GitHub repository.
