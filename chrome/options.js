/**
 * Options page script: dynamic localization, dropdown loading, saving/loading settings.
 */

const DEFAULT_SETTINGS = {
  language: "en",
  defaultAction: "default",
  shiftAction: "reuse",
  modifierAction: "disabled",
  fallbackWhenNotSplit: "background",
  debugLog: false,
};

const TRANSLATIONS = {
  en: {
    title: "Split Link Router - Settings",
    subtitle: "Route external links to the secondary tab of Chrome's native split-view using modifier keys. By default, it only handles clicks you explicitly specify and won't affect normal browsing.",
    label_language: "Language",
    desc_language: "Choose the display language for the options page.",
    name_defaultAction: "Normal click behavior",
    desc_defaultAction: "How external links open when clicked normally (without modifier keys). By default, it is not intercepted, preserving Chrome's native behavior.",
    name_shiftAction: "Shift click behavior",
    desc_shiftAction: "How external links open when holding Shift. 'Reuse secondary tab' is recommended: swap the URL in the tab on the other side of the split screen.",
    name_modifierAction: "Cmd / Ctrl click behavior",
    desc_modifierAction: "How external links open when holding Cmd (macOS) or Ctrl (Win/Linux). By default, it is not intercepted (Chrome native background new tab).",
    name_fallbackWhenNotSplit: "Fallback when not split",
    desc_fallbackWhenNotSplit: "How to handle a click if the 'Reuse secondary tab' action is triggered but the current tab is not in a split view (no secondary tab exists).",
    name_debugLog: "Debug log",
    desc_debugLog: "Print intercept logs in the service worker's DevTools Console.",
    label_debugLog: "Enable",
    saved: "Saved ✓",
    footer: "<p><strong>Requires Chrome 140+</strong>. First use: right-click a tab in the target window → <code>Open in split view</code> to set up a split screen. After that, this extension's 'Reuse' feature will take effect.</p>",
    open_modes: {
      default: "Don't intercept (Preserve Chrome native behavior)",
      reuse: "Reuse secondary tab (navigate the split-screen tab)",
      background: "New background tab",
      foreground: "New foreground tab",
      current: "Navigate current tab (override page)",
    },
    shift_cmd_extra: {
      disabled: "Don't intercept (Follow normal click)",
    },
    fallback_options: {
      background: "New background tab",
      foreground: "New foreground tab",
      notify: "Show alert: Please enter split view manually first",
    }
  },
  zh: {
    title: "Split Link Router - 设置",
    subtitle: "用修饰键把外链路由到 Chrome 原生分屏的\"副屏\" tab。默认只接管你明确指定的点击，不打扰普通浏览。",
    label_language: "语言 (Language)",
    desc_language: "选择设置页面的显示语言。",
    name_defaultAction: "普通点击行为",
    desc_defaultAction: "无修饰键直接点击外链时的处理方式。默认不拦截，保持 Chrome 原生行为。",
    name_shiftAction: "Shift 点击行为",
    desc_shiftAction: "按住 Shift 点击时的打开方式。推荐\"复用副屏\"：在分屏另一侧 tab 里换 URL。",
    name_modifierAction: "Cmd / Ctrl 点击行为",
    desc_modifierAction: "按住 Cmd（macOS）或 Ctrl（Win/Linux）点击时的打开方式。默认不拦截（Chrome 原生后台新 tab）。",
    name_fallbackWhenNotSplit: "不在分屏时的回退",
    desc_fallbackWhenNotSplit: "当\"复用副屏\"模式触发时，如果当前 tab 还没进入分屏（没有副屏 tab），如何处理。",
    name_debugLog: "调试日志",
    desc_debugLog: "在 service worker 的 DevTools Console 打印拦截日志。",
    label_debugLog: "启用",
    saved: "已保存 ✓",
    footer: "<p><strong>需要 Chrome 140+</strong>。首次使用：在目标窗口右键 tab → <code>Open in split view</code>，把两个 tab 组成分屏；之后本扩展的\"复用\"功能就会生效。</p>",
    open_modes: {
      default: "不拦截（Chrome 原生行为）",
      reuse: "复用副屏（在分屏另一侧 tab 里换 URL）",
      background: "后台新 tab",
      foreground: "前台新 tab",
      current: "在当前 tab 导航（覆盖当前页）",
    },
    shift_cmd_extra: {
      disabled: "不拦截（跟随普通点击）",
    },
    fallback_options: {
      background: "后台新 tab",
      foreground: "前台新 tab",
      notify: "弹提示：请先手动进入分屏",
    }
  },
  ru: {
    title: "Split Link Router - Настройки",
    subtitle: "Перенаправление внешних ссылок на вторичную вкладку встроенного разделенного экрана Chrome с помощью клавиш-модификаторов. По умолчанию плагин обрабатывает только явно указанные клики.",
    label_language: "Язык (Language)",
    desc_language: "Выберите язык отображения для этой страницы настроек.",
    name_defaultAction: "Обычный клик",
    desc_defaultAction: "Обработка при клике без клавиш-модификаторов. По умолчанию не перехватывается, сохраняя стандартное поведение Chrome.",
    name_shiftAction: "Клик с Shift",
    desc_shiftAction: "Способ открытия при удержании Shift. Рекомендуется 'Использовать вторичную вкладку': открывать URL на другой стороне разделенного экрана.",
    name_modifierAction: "Клик с Cmd / Ctrl",
    desc_modifierAction: "Способ открытия при удержании Cmd (macOS) или Ctrl (Win/Linux). По умолчанию не перехватывается (фоновая новая вкладка).",
    name_fallbackWhenNotSplit: "Действие вне разделенного экрана",
    desc_fallbackWhenNotSplit: "Что делать, если сработал режим 'Использовать вторичную вкладку', но текущая вкладка еще не разделена (нет вторичной вкладки).",
    name_debugLog: "Журнал отладки",
    desc_debugLog: "Выводить логи перехвата в DevTools Console сервисного воркера.",
    label_debugLog: "Включить",
    saved: "Сохранено ✓",
    footer: "<p><strong>Требуется Chrome 140+</strong>. Первое использование: кликните правой кнопкой мыши по вкладке в целевом окне → <code>Open in split view</code>, чтобы создать разделенный экран. После этого функция автозаполнения заработает.</p>",
    open_modes: {
      default: "Не перехватывать (Стандартное поведение Chrome)",
      reuse: "Использовать вторичную вкладку (изменение URL в разделенном экране)",
      background: "Новая фоновая вкладка",
      foreground: "Новая активная вкладка",
      current: "Открыть в текущей вкладке (перейти на страницу)",
    },
    shift_cmd_extra: {
      disabled: "Не перехватывать (Следовать обычному клику)",
    },
    fallback_options: {
      background: "Новая фоновая вкладка",
      foreground: "Новая активная вкладка",
      notify: "Показать предупреждение: Войдите в режим разделения экрана вручную",
    }
  },
  ar: {
    title: "Split Link Router - الإعدادات",
    subtitle: "توجيه الروابط الخارجية إلى علامة التبويب الثانوية لعرض التقسيم الأصلي في Chrome باستخدام مفاتيح التعديل. افتراضيًا، يتعامل فقط مع النقرات المحددة.",
    label_language: "اللغة (Language)",
    desc_language: "اختر لغة العرض لصفحة الإعدادات.",
    name_defaultAction: "سلوك النقرة العادية",
    desc_defaultAction: "طريقة المعالجة عند النقر بدون مفاتيح تعديل. افتراضيًا لا يتم الاعتراض، مع الحفاظ على سلوك كروم الافتراضي.",
    name_shiftAction: "سلوك النقرة مع Shift",
    desc_shiftAction: "طريقة الفتح عند الضغط على Shift. يوصى بـ 'إعادة استخدام علامة التبويب الثانوية': تغيير الرابط في علامة التبويب الأخرى.",
    name_modifierAction: "سلوك النقرة مع Cmd / Ctrl",
    desc_modifierAction: "طريقة الفتح عند الضغط على Cmd (macOS) أو Ctrl (Win/Linux). افتراضيًا لا يتم الاعتراض (علامة تبويب جديدة في الخلفية).",
    name_fallbackWhenNotSplit: "الرجوع عند عدم التقسيم",
    desc_fallbackWhenNotSplit: "كيفية التعامل إذا تم تفعيل وضع 'إعادة استخدام علامة التبويب الثانوية' ولكن علامة التبويب الحالية ليست في عرض تقسيم.",
    name_debugLog: "سجل التصحيح",
    desc_debugLog: "طباعة سجلات الاعتراض في وحدة تحكم أدوات المطورين (DevTools Console).",
    label_debugLog: "تفعيل",
    saved: "تم الحفظ ✓",
    footer: "<p><strong>يتطلب متصفح كروم 140+</strong>. الاستخدام الأول: انقر بزر الماوس الأيمن على علامة التبويب في النافذة المستهدفة ← <code>Open in split view</code> لتقسيم الشاشة؛ بعد ذلك سيعمل سلوك الفتح المخصص.</p>",
    open_modes: {
      default: "عدم الاعتراض (سلوك كروم الافتراضي)",
      reuse: "إعادة استخدام علامة التبويب الثانوية (تغيير الرابط في شاشة التقسيم)",
      background: "علامة تبويب جديدة في الخلفية",
      foreground: "علامة تبويب جديدة في المقدمة",
      current: "الفتح في علامة التبويب الحالية (استبدال الصفحة)",
    },
    shift_cmd_extra: {
      disabled: "عدم الاعتراض (اتباع النقرة العادية)",
    },
    fallback_options: {
      background: "علامة تبويب جديدة في الخلفية",
      foreground: "علامة تبويب جديدة في المقدمة",
      notify: "عرض تنبيه: يرجى الدخول إلى وضع تقسيم الشاشة يدويًا أولاً",
    }
  },
  id: {
    title: "Split Link Router - Pengaturan",
    subtitle: "Rute tautan eksternal ke tab sekunder dari layar pisah bawaan Chrome menggunakan tombol pengubah. Secara default, hanya menangani klik yang Anda tentukan secara eksplisit.",
    label_language: "Bahasa (Language)",
    desc_language: "Pilih bahasa tampilan untuk halaman pengaturan ini.",
    name_defaultAction: "Perilaku klik biasa",
    desc_defaultAction: "Penanganan ketika mengklik tautan eksternal secara biasa tanpa tombol pengubah. Secara default tidak dicegat, menjaga perilaku bawaan Chrome.",
    name_shiftAction: "Perilaku klik Shift",
    desc_shiftAction: "Cara membuka saat menahan tombol Shift. Disarankan 'Gunakan kembali tab sekunder': memuat URL di tab pada sisi lain layar pisah.",
    name_modifierAction: "Perilaku klik Cmd / Ctrl",
    desc_modifierAction: "Cara membuka saat menahan tombol Cmd (macOS) atau Ctrl (Win/Linux). Secara default tidak dicegat (tab baru di latar belakang).",
    name_fallbackWhenNotSplit: "Fallback saat tidak dibagi",
    desc_fallbackWhenNotSplit: "Cara menangani jika aksi 'Gunakan kembali tab sekunder' dipicu tetapi tab saat ini belum berada di layar pemisahan.",
    name_debugLog: "Log debug",
    desc_debugLog: "Cetak log intersepsi ke Konsol DevTools service worker.",
    label_debugLog: "Aktifkan",
    saved: "Disimpan ✓",
    footer: "<p><strong>Membutuhkan Chrome 140+</strong>. Penggunaan pertama: klik kanan tab pada jendela target → <code>Open in split view</code> untuk membagi layar; setelah itu fungsi ini akan berjalan otomatis.</p>",
    open_modes: {
      default: "Jangan cegat (Perilaku bawaan Chrome)",
      reuse: "Gunakan kembali tab sekunder (navigasi di tab layar pemisahan)",
      background: "Tab baru di latar belakang",
      foreground: "Tab baru di latar depan",
      current: "Navigasi di tab saat ini (ganti halaman)",
    },
    shift_cmd_extra: {
      disabled: "Jangan cegat (Ikuti klik biasa)",
    },
    fallback_options: {
      background: "Tab baru di latar belakang",
      foreground: "Tab baru di latar depan",
      notify: "Tampilkan peringatan: Harap masuk ke mode layar pisah secara manual terlebih dahulu",
    }
  }
};

function fillSelect(selectEl, valuesMap, extraValuesMap = {}, currentLang = "en") {
  const selectedVal = selectEl.value;
  selectEl.innerHTML = "";
  
  for (const [val, labelKey] of Object.entries(valuesMap)) {
    const opt = document.createElement("option");
    opt.value = val;
    const langDict = TRANSLATIONS[currentLang] || TRANSLATIONS["en"];
    opt.textContent = langDict.open_modes[val] || val;
    selectEl.appendChild(opt);
  }
  
  for (const [val, labelKey] of Object.entries(extraValuesMap)) {
    const opt = document.createElement("option");
    opt.value = val;
    const langDict = TRANSLATIONS[currentLang] || TRANSLATIONS["en"];
    opt.textContent = langDict.shift_cmd_extra[val] || val;
    selectEl.appendChild(opt);
  }

  if (selectedVal) {
    selectEl.value = selectedVal;
  }
}

function fillFallbackSelect(selectEl, fallbackMap, currentLang = "en") {
  const selectedVal = selectEl.value;
  selectEl.innerHTML = "";
  
  for (const [val, labelKey] of Object.entries(fallbackMap)) {
    const opt = document.createElement("option");
    opt.value = val;
    const langDict = TRANSLATIONS[currentLang] || TRANSLATIONS["en"];
    opt.textContent = langDict.fallback_options[val] || val;
    selectEl.appendChild(opt);
  }

  if (selectedVal) {
    selectEl.value = selectedVal;
  }
}

function applyTranslations(lang) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS["en"];
  
  document.getElementById("page_title").textContent = dict.title;
  document.getElementById("subtitle").textContent = dict.subtitle;
  
  document.getElementById("label_language").textContent = dict.label_language;
  document.getElementById("desc_language").textContent = dict.desc_language;

  document.getElementById("name_defaultAction").textContent = dict.name_defaultAction;
  document.getElementById("desc_defaultAction").textContent = dict.desc_defaultAction;

  document.getElementById("name_shiftAction").textContent = dict.name_shiftAction;
  document.getElementById("desc_shiftAction").textContent = dict.desc_shiftAction;

  document.getElementById("name_modifierAction").textContent = dict.name_modifierAction;
  document.getElementById("desc_modifierAction").textContent = dict.desc_modifierAction;

  document.getElementById("name_fallbackWhenNotSplit").textContent = dict.name_fallbackWhenNotSplit;
  document.getElementById("desc_fallbackWhenNotSplit").textContent = dict.desc_fallbackWhenNotSplit;

  document.getElementById("name_debugLog").textContent = dict.name_debugLog;
  document.getElementById("desc_debugLog").textContent = dict.desc_debugLog;

  const debugCheckbox = document.getElementById("debugLog");
  const labelDebug = document.getElementById("label_debugLog");
  labelDebug.innerHTML = "";
  labelDebug.appendChild(debugCheckbox);
  labelDebug.appendChild(document.createTextNode(" " + dict.label_debugLog));

  document.getElementById("saved").textContent = dict.saved;
  document.getElementById("footer_text").innerHTML = dict.footer;

  const openModesStructure = { default: 1, reuse: 1, background: 1, foreground: 1, current: 1 };
  const extraModesStructure = { disabled: 1 };
  const fallbackStructure = { background: 1, foreground: 1, notify: 1 };

  fillSelect(document.getElementById("defaultAction"), openModesStructure, {}, lang);
  fillSelect(document.getElementById("shiftAction"), openModesStructure, extraModesStructure, lang);
  fillSelect(document.getElementById("modifierAction"), openModesStructure, extraModesStructure, lang);
  fillFallbackSelect(document.getElementById("fallbackWhenNotSplit"), fallbackStructure, lang);
}

async function load() {
  const saved = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...saved };
  const lang = settings.language || "en";

  document.getElementById("language").value = lang;
  
  applyTranslations(lang);

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === "checkbox") {
      el.checked = Boolean(settings[key]);
    } else {
      el.value = settings[key];
    }
  }
}

function bindChange() {
  const savedEl = document.getElementById("saved");
  const keys = Object.keys(DEFAULT_SETTINGS);
  for (const key of keys) {
    const el = document.getElementById(key);
    if (!el) continue;
    el.addEventListener("change", async () => {
      const value = el.type === "checkbox" ? el.checked : el.value;
      await chrome.storage.sync.set({ [key]: value });
      
      if (key === "language") {
        applyTranslations(value);
      }

      savedEl.classList.add("show");
      clearTimeout(savedEl.__t);
      savedEl.__t = setTimeout(() => savedEl.classList.remove("show"), 1200);
    });
  }
}

load().then(bindChange);
