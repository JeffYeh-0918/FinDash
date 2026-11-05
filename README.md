# FinDash

單頁 Vue 應用（GitHub Pages）＋ Google Apps Script 後端。不需要打包，瀏覽器直接載入 ES modules。

## 目錄

| 路徑 | 內容 |
|---|---|
| `index.html` | 畫面範本＋主程式；**頂端的 import map 是各模組的版本對照表** |
| `css/app.css` | 手寫樣式 |
| `css/tailwind.css` | Tailwind 預先編譯結果（**要先 build 並提交**） |
| `js/logic/*.js` | 純邏輯模組（不碰畫面，可直接測試） |
| `tests/` | 自動測試 |

## 第一次設定（VS Code 終端機）

```
npm install
npm run build:css      # 產生 css/tailwind.css
npm test               # 跑測試
```

## 本機預覽

本機不能直接雙擊 index.html（瀏覽器不允許從 file:// 載入 ES modules）。
在 VS Code 安裝擴充功能 **Live Server**，對 `index.html` 按右鍵 → Open with Live Server。

## 日常流程

- 改了畫面或任何 `index.html` 內的 Tailwind class → `npm run build:css`（或開著 `npm run watch:css`）→ 一起提交 `css/tailwind.css`。
- 改了某個 `js/logic/xxx.js` → 到 `index.html` 的 import map 把該檔案的 `?v=` 數字加 1。
- 改了 `css/app.css` 或重新編譯 Tailwind → 把 `<link>` 後面的 `?v=` 加 1。
- 提交前 `npm test`。
