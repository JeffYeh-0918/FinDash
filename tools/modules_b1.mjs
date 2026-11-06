// 第 3-1 批：要從 setup() 搬出去的宣告（依功能分組）
export const MODULES = {
    ui: {
        file: 'ui', fn: 'useUi', title: '提示條、確認／輸入視窗、復原',
        names: ['toasts','toastSeq','dismissToast','showToast','runToastAction','toastClass','dialog','askConfirm','askInput','closeDialog','submitDialog','cancelDialog',
                'lastSyncFailToast','lastPriceFailToast','notifySyncFailure','notifyPriceFailure','undoSnap','undoTimer','undoToast','captureUndo','armUndo','clearUndo','withUndo','undoLast']
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
    }
};
