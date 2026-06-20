const TRANSLATIONS = {
  en: {
    desc: "First use: right-click a tab → <b>Open in split view</b> to set up a split screen; then, external link clicks will be routed to the secondary tab.",
    btn: "Open Settings"
  },
  zh: {
    desc: "首次使用：右键 tab → <b>Open in split view</b> 组成分屏，然后外链点击会路由到副屏。",
    btn: "打开设置"
  },
  ru: {
    desc: "Первое использование: кликните правой кнопкой мыши по вкладке → <b>Open in split view</b>, чтобы разделить экран, после чего клики будут перенаправляться.",
    btn: "Открыть настройки"
  },
  ar: {
    desc: "الاستخدام الأول: انقر بزر الماوس الأيمن على علامة التبويب ← <b>Open in split view</b> لتقسيم الشاشة؛ ثم سيتم توجيه نقرات الروابط الخارجية.",
    btn: "فتح الإعدادات"
  },
  id: {
    desc: "Penggunaan pertama: klik kanan tab → <b>Open in split view</b> untuk membagi layar; kemudian klik tautan eksternal akan dirutekan ke tab sekunder.",
    btn: "Buka Pengaturan"
  }
};

chrome.storage.sync.get({ language: "en" }, (settings) => {
  const lang = settings.language || "en";
  const dict = TRANSLATIONS[lang] || TRANSLATIONS["en"];
  document.getElementById("popup_desc").innerHTML = dict.desc;
  document.getElementById("openOptions").textContent = dict.btn;
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
