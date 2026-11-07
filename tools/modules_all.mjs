// 完整分組：setup() 裡的宣告歸屬哪個功能模組（來源為 V14 的 index.html）。
// 名稱以 '~' 開頭＝用「陳述式開頭文字」比對（用於 watch、provide 這類沒有名稱的陳述式）。
// 沒列在這裡的宣告會留在主程式（生命週期：onMounted／onUpdated 等）。
export const MODULES = {
    state: {
        file: 'state', fn: 'useState', title: '核心資料與共用狀態（收支、股票、設定、篩選條件、彈窗開關、表單）',
        names: ['STORAGE_KEY_EXPENSES','STORAGE_KEY_STOCKS','STORAGE_KEY_PRICES','STORAGE_KEY_GAS_URL','STORAGE_KEY_CATEGORIES','STORAGE_KEY_ITEMS','STORAGE_KEY_PAYMENTS','STORAGE_KEY_BLACKLIST',
            'realNow','currentRealYear','currentRealMonth','todayStr','fileInputRef','draggedIndex','gasApiUrl','inputApiUrl','showApiConfigModal','showOptionManagerModal','isSyncing','rawExpenses','rawStocks',
            'expenses','stockTrades','livePricesMap','activeTab','selectedYear','selectedMonth','isFetchingPrices','lastPriceUpdate','expenseSearch','expenseMonthFilterScope','selectedCategoryFilters',
            'selectedItemFilters','selectedPaymentFilters','selectedTypeFilters','filterYears','filterMonths','activeDropdown','toggleDropdown','closeAllDropdowns','~provide(\'dropdown\'',
            'selectedExpenseIds','selectedStockIds','showExpenseModal','editingExpenseId','showStockModal','editingStockId','showBatchDateModal','showBatchCopyModal','targetCopyDate','showImportHelpModal',
            'batchDateType','targetBatchDate','expenseForm','stockForm','appSettings','showCardSettingsModal','showRealizedModal','roundTwo','formatCurrency','isCurrentMonthOrFuture','signedCurrency',
            'PAGE_SIZE','visibleCount','DEFAULT_STOCK_PAY','stockSearch','stockFilterSymbols','stockFilterActions','stockFilterYears','stockFilterMonths','includeInvest','isCard','getCardDay','expenseSnap']
    },
    options: {
        file: 'options', fn: 'useOptions', title: '類別／項目／付款方式的選項清單與增刪改名',
        names: ['defaultCategories','defaultItems','defaultPayments','categoriesList','itemsList','paymentMethodsList','blacklistedOptions','refreshDynamicOptions','renameInSettings','removeFromSettings',
            'editOptionName','deleteOptionItem','promptAddOption','categoryFilterLabel','itemFilterLabel','paymentFilterLabel','~watch(appSettings,','~watch([categoriesList,']
    },
    ui: {
        file: 'ui', fn: 'useUi', title: '提示條、確認／輸入視窗、復原',
        names: ['toasts','toastSeq','dismissToast','showToast','runToastAction','toastClass','dialog','askConfirm','askInput','closeDialog','submitDialog','cancelDialog',
            'lastSyncFailToast','lastPriceFailToast','notifySyncFailure','notifyPriceFailure','undoSnap','undoTimer','undoToast','captureUndo','armUndo','clearUndo','withUndo','undoLast']
    },
    sync: {
        file: 'sync-ui', fn: 'useSyncUi', title: '雲端同步接線（狀態徽章、API 設定、清空重來）',
        names: ['api','engine','syncState','syncBadge','pushToCloud','pushNow','syncFromCloud','saveApiUrl','resetAllData','~watch(expenses,','~watch(stockTrades,','~watch(livePricesMap,']
    },
    modals: {
        file: 'modals', fn: 'useModals', title: '彈窗規則（Esc、點背景、焦點管理、未儲存內容詢問）',
        names: ['modalRegistry','requestClose','onBackdrop','topModalEl','FOCUSABLE','handleGlobalKeydown','currentModalEl','lastFocusEl','enhanceModals']
    },
    charts: {
        file: 'charts', fn: 'useCharts', title: '圖表（Chart.js）',
        names: ['categoryChartInstance','paymentChartInstance','stockPLChartInstance','stockAllocationChartInstance','CHART_GRID','valueAxisStyle','categoryAxisStyle','valueLabelPlugin','renderCharts']
    },
    importExport: {
        file: 'import-export', fn: 'useImportExport', title: 'Excel 匯入／匯出',
        names: ['exportToExcel','showImportPreviewModal','importPreview','importSummary','importIssues','handleFileUpload','commitImport','downloadTemplateExcel']
    },
    settingsUi: {
        file: 'settings-ui', fn: 'useSettingsUi', title: '設定視窗：類別與項目、付款與帳單、清空重來',
        names: ['showFlowSettingsModal','categoryKind','setCategoryKind','colorPanelCat','toggleColorPanel','setCategoryColor','toggleFlowList','addFundingRule','removeFundingRule','fundingMatchCount','prepaidUseCount',
            'itemsByCategory','itemGroups','showCategoryMapModal','catMapKeys','allowedItems','formCategories','formItems','onCategoryChange','isAllItems','toggleAllItems','catHasItem','toggleCatItem','allKnownItems',
            'mismatchGroups','mismatchTotal','fixTarget','getFixTarget','applyCategoryFix','catTab','payTab','openCategorySettings','openPaymentSettings','showResetModal','resetConfirmText','openResetModal','confirmResetAll']
    },
    expenses: {
        file: 'expenses', fn: 'useExpenses', title: '日常收支：篩選、分頁、勾選合計、拖曳排序、新增／編輯／刪除、批次操作',
        names: ['draggingIds','onDragStart','onDragEnd','onDragOver','onDrop','selectedExpenseStats','loadMoreExpenses','onExpenseScroll','dateFilterActive','yearsOf','expenseYearOptions','filteredExpenses','displayedExpenses',
            'expenseFilterActive','resetFilters','monthSelectOptions','typeSelectOptions','expenseYearSelectOptions','isAllExpensesSelected','toggleSelectAllExpenses','openBatchCopyModal','applyBatchCopy',
            'openExpenseModal','saveExpenseSubmit','confirmDeleteExpense','confirmBatchDeleteExpenses','newExpenseId','openBatchDateModal','applyBatchDate','changeMonth','~watch([expenseSearch,','~watch(filteredExpenses,']
    },
    stocks: {
        file: 'stocks', fn: 'useStocks', title: '股票：持股與損益、報價、篩選、交易新增／編輯／刪除、與收支連動',
        names: ['calculatedStockTotal','fetchStockPrices','isMarketOpen','stockHoldings','totalInvestmentMarketValue','totalUnrealizedPL','totalUnrealizedPLRate','realizedInfo','totalRealizedPL','realizedRowsDesc',
            'realizedBySymbolList','dividendBySymbol','totalDividend','stockSymbolOptions','stockYearOptions','filteredStockTrades','stockFilterActive','resetStockFilters','stockSymbolSelectOptions','stockYearSelectOptions',
            'stockActionSelectOptions','isAllStocksSelected','toggleSelectAllStocks','selectedStockStats','lastStockPay','stockExpenseFields','findLinkedExpense','findMatchingExpense','openStockModal',
            'saveStockTradeSubmit','confirmDeleteStockTrade','confirmBatchDeleteStockTrades','stockDiffers','looksSimilar','syncLegacyStockExpenses','~watch(filteredStockTrades,']
    },
    ledgerView: {
        file: 'ledger-view', fn: 'useLedgerView', title: '月收支表、頁面上方卡片、信用卡待結算、項目／付款管道圖表資料',
        names: ['monthlyExpensesFiltered','monthKey','monthlyLedger','monthlyTotalIncome','monthlyTotalExpense','monthlyInvestNet','monthlySavingsRate','toggleCard','setCardDay','cardOffset','cardDetail','cardRows','cardStatements',
            'openCardDetail','catColor','catChartColor','lightColor','itemChartData','itemChartLegend','paymentChartData','itemDetail','openItemDetail','~watch([includeInvest,','monthlyInvestSummary','ledger','ZERO_BUCKET',
            'bucketHasData','ledgerRow','ymKey','ledgerMonthRows','ledgerYearRows','showOtherCol','showAdvanceCol','goToMonth']
    }
};
// 跨模組共用、又會被重新賦值的 let 變數：改成 ref（讀取與賦值都改用 .value）
export const REFIFY = ['expenseSnap', 'stockSnap'];
