# FinDash

單頁 Vue 應用（GitHub Pages）＋ Google Apps Script 後端。不需要打包，瀏覽器直接載入 ES modules。

## 目錄

| 路徑 | 內容 |
|---|---|
| `index.html` | 畫面範本＋主程式；**頂端的 import map 是各模組的版本對照表** |
| `css/app.css` | 手寫樣式 |
| `css/tailwind.css` | Tailwind 預先編譯結果（**要先 build 並提交**） |
| `js/logic/*.js` | 純邏輯模組（不碰畫面，可直接測試） |
| `js/data/api.js` | **唯一與後端溝通的介面**（Apps Script、FinMind）；之後換資料庫只重寫它與 `convert.js` |
| `js/data/convert.js` | 本機資料 ↔ 雲端資料的轉換（日期統一、股票代碼清理、上傳格式） |
| `js/data/sync.js` | 同步引擎（版本號、未同步旗標、延遲上傳、衝突／縮水／雲端為空的保護），不含畫面 |
| `js/features/*.js` | 功能模組：從主程式搬出的 JS 邏輯，一個檔案管一塊功能（見下） |
| `tests/` | 自動測試 |
| `tools/` | 開發用檢查工具（`check` 用的三支，以及拆檔時用的比對工具） |

## 功能模組（js/features/）

`index.html` 的主程式（`setup()`）現在只負責「依序建立各功能模組」，每個功能的程式碼都在自己的檔案裡：

| 檔案 | 管什麼 |
|---|---|
| `state.js` | 核心資料與共用狀態：收支、股票、設定、篩選條件、彈窗開關、表單 |
| `options.js` | 類別／項目／付款方式的選項清單與增刪改名 |
| `ui.js` | 提示條、確認／輸入視窗、復原 |
| `sync-ui.js` | 雲端同步接線：狀態徽章、API 設定、清空重來 |
| `modals.js` | 彈窗規則：Esc、點背景、焦點管理、未儲存內容詢問 |
| `charts.js` | 所有圖表（Chart.js） |
| `import-export.js` | Excel 匯入／匯出、匯入預覽 |
| `settings-ui.js` | 設定視窗：類別與項目（屬性、顏色）、付款與帳單 |
| `expenses.js` | 日常收支：篩選、分頁、勾選合計、新增／編輯／刪除、批次操作 |
| `stocks.js` | 股票：持股與損益、報價、篩選、交易新增／編輯／刪除、與收支連動 |
| `ledger-view.js` | 月收支表、頁面上方卡片、信用卡待結算、圖表資料 |
| `mobile-cards.js` | 手機與平板（< 1024px）的卡片：依日期分組、類別圖示、選取、月收支比例條 |
| `card-drag.js` | 拖曳排序（Pointer Events，手機／平板卡片與電腦表格共用）：長按選取、浮動卡片堆、插入指示線、邊緣自動捲動、Esc 取消。排序與幾何邏輯在 `js/logic/reorder.js`（`moveGroup`）、`js/logic/drag.js` |

**找功能**：想改哪個畫面的行為，就開對應的檔案；畫面本身（HTML）仍在 `index.html`。

**運作方式**：每個檔案是一個函式 `useXxx(ctx)`。`ctx` 是共用環境，裡面有「前面已建立的模組」提供的成員。
- 函式開頭 `const { … } = ctx;`：取用前面模組的成員。
- 函式開頭「取用較晚建立的模組成員」那一段：兩個模組互相呼叫時，用到的當下才去 `ctx` 找。
- 最後 `return { … }`：提供給別人（其他模組或範本）的成員。

**範本（HTML）用到新名稱時**：把名稱加進 `index.html` 裡的 `TEMPLATE_MEMBERS`，並確認它在某個模組的 `return` 裡。
**模組要用到別的模組的東西時**：加進該檔開頭的 `const { … } = ctx;`（或轉接區）。
漏接任何一項，`npm run verify` 都會告訴你。

## 第一次設定（VS Code 終端機）

```
npm install
npm run build:css      # 產生 css/tailwind.css
npm test               # 跑單元測試
npm run verify         # 一次跑：單元測試＋變數宣告檢查＋介面契約檢查＋煙霧測試
```

## 本機預覽

本機不能直接雙擊 index.html（瀏覽器不允許從 file:// 載入 ES modules）。
在 VS Code 安裝擴充功能 **Live Server**，對 `index.html` 按右鍵 → Open with Live Server。

## 日常流程

- 改了畫面或任何 `index.html` 內的 Tailwind class → `npm run build:css`（或開著 `npm run watch:css`）→ 一起提交 `css/tailwind.css`。
- 改了某個 `js/logic/xxx.js` → 到 `index.html` 的 import map 把該檔案的 `?v=` 數字加 1。
- 改了 `css/app.css` 或重新編譯 Tailwind → 把 `<link>` 後面的 `?v=` 加 1。
- 提交前 `npm run verify`。
