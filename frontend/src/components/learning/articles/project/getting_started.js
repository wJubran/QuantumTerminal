// Article: Install & first run.
// Rule for Arabic body: keep every technical term and command in English.
// Commands must match the repository README exactly.

export default {
  id: "getting_started",
  category: "project",
  order: 0.2,
  title: {
    en: "Install & first run",
    ar: "التثبيت والتشغيل لأول مرة",
  },
  tags: ["install", "setup", "launcher", "electron", "python", "تثبيت", "تشغيل"],
  summary: {
    en: "From a fresh clone to a running terminal in three commands — with a live MetaTrader 5 feed or the built-in simulated market.",
    ar: "من نسخ المشروع إلى تشغيل المنصة في ثلاثة أوامر — مع بيانات MetaTrader 5 الحية أو مع السوق المحاكى المدمج.",
  },
  sections: [
    {
      heading: { en: "Requirements", ar: "المتطلبات" },
      bullets: [
        {
          en: "Python 3.10 or newer.",
          ar: "Python 3.10 أو أحدث.",
        },
        {
          en: "MetaTrader 5 on Windows — only for the live MT5 feed. Not needed with --sim, which runs on Windows, macOS and Linux.",
          ar: "MetaTrader 5 على Windows — فقط لبيانات MT5 الحية. لا حاجة إليه مع --sim الذي يعمل على Windows وmacOS وLinux.",
        },
        {
          en: "Node.js — only for the desktop app or to rebuild the user interface.",
          ar: "Node.js — فقط لتطبيق سطح المكتب أو لإعادة بناء الواجهة.",
        },
      ],
    },
    {
      heading: { en: "Install", ar: "التثبيت" },
      bullets: [
        {
          en: "git clone https://github.com/wJubran/QuantumTerminal.git",
          ar: "git clone https://github.com/wJubran/QuantumTerminal.git",
        },
        {
          en: "cd QuantumTerminal/backend",
          ar: "cd QuantumTerminal/backend",
        },
        {
          en: "pip install -r requirements.txt — the MetaTrader5 package is installed on Windows only.",
          ar: "pip install -r requirements.txt — حزمة MetaTrader5 تُثبَّت على Windows فقط.",
        },
      ],
    },
    {
      heading: { en: "Run", ar: "التشغيل" },
      bullets: [
        {
          en: "python launcher.py — live prices from your MetaTrader 5 terminal.",
          ar: "python launcher.py — أسعار حية من منصة MetaTrader 5 لديك.",
        },
        {
          en: "python launcher.py --sim — simulated market with a paper-trading account, no broker needed.",
          ar: "python launcher.py --sim — سوق محاكى مع حساب تداول ورقي، بدون أي وسيط.",
        },
      ],
      paragraphs: [
        {
          en: "The terminal opens in your browser at http://127.0.0.1:8502. Everything is unlocked — there is no sign-up.",
          ar: "تُفتح المنصة في المتصفح على العنوان http://127.0.0.1:8502. كل شيء متاح مباشرة — لا يوجد تسجيل.",
        },
      ],
    },
    {
      heading: { en: "Desktop app (Electron)", ar: "تطبيق سطح المكتب (Electron)" },
      paragraphs: [
        {
          en: "From the electron_shell folder run npm install once, then npm start (or npm run start:sim for the simulated market). The app starts the backend for you and shows the terminal in its own window.",
          ar: "من مجلد electron_shell نفّذ npm install مرة واحدة، ثم npm start (أو npm run start:sim للسوق المحاكى). التطبيق يشغّل الـ backend تلقائياً ويعرض المنصة في نافذة مستقلة.",
        },
      ],
    },
    {
      heading: { en: "Useful options", ar: "خيارات مفيدة" },
      bullets: [
        {
          en: "--port 8600 — use another HTTP port (default 8502).",
          ar: "--port 8600 — استخدام منفذ HTTP آخر (الافتراضي 8502).",
        },
        {
          en: "--no-browser — don't open the system browser automatically.",
          ar: "--no-browser — عدم فتح المتصفح تلقائياً.",
        },
        {
          en: "Cones: on a chart, open the ▾ next to CONES and pick DAILY, WEEKLY, MONTHLY or QUARTERLY (and BATES for the Bates model). They are ready a few seconds after start-up; set MK_LOCAL_ANALYSIS=0 to turn the computation off.",
          ar: "الـ cones: على الشارت افتح السهم ▾ بجانب CONES واختر DAILY أو WEEKLY أو MONTHLY أو QUARTERLY (وBATES لنموذج Bates). تكون جاهزة بعد التشغيل بثوانٍ؛ ولإيقاف حسابها اضبط MK_LOCAL_ANALYSIS=0.",
        },
        {
          en: "Connect MetaTrader 5 from ⚙ Settings → PROVIDERS: TERMINAL PATH (leave it blank to auto-detect the default install) or LOGIN CREDENTIALS (server + login).",
          ar: "اربط MetaTrader 5 من ⚙ Settings ← PROVIDERS: إما TERMINAL PATH (اتركه فارغاً لاكتشاف التثبيت الافتراضي تلقائياً) أو LOGIN CREDENTIALS (السيرفر وبيانات الدخول).",
        },
        {
          en: "No MetaTrader 5? Pick Yahoo Finance or Binance in ⚙ Settings → DATA SOURCES (free, no account), or start with --provider yahoo, and trade on the paper account at live prices.",
          ar: "لا يوجد لديك MetaTrader 5؟ اختر Yahoo Finance أو Binance من ⚙ Settings ← DATA SOURCES (مجاناً وبدون حساب)، أو شغّل المنصة بالخيار --provider yahoo، وتداول على الـ paper account بأسعار حية.",
        },
      ],
    },
  ],
};
