// 與原本 index.html 內嵌的 tailwind.config 相同（搬出來）
module.exports = {
  darkMode: 'class',
  // 只掃這些檔案裡出現過的 class（新增資料夾放程式時，記得加進來）
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        slate: { 850: '#131e32', 900: '#0f172a', 950: '#020617' },
      },
    },
  },
};
