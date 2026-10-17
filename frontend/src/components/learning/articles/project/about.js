// Article: What is Quantum Terminal — the project in one page.
// Rule for Arabic body: keep every technical term in English (FastAPI, MT5,
// WebSocket, GEX, etc.). Surrounding prose is simplified Arabic.

export default {
  id: "about_quantum_terminal",
  category: "project",
  order: 0.1,
  title: {
    en: "What is Quantum Terminal?",
    ar: "ما هو Quantum Terminal؟",
  },
  tags: ["about", "overview", "open source", "project", "quantum terminal", "مفتوح المصدر"],
  summary: {
    en: "A free, open-source trading terminal that draws probability models — volatility cones, bands, options positioning — on top of live charts, with a built-in simulated market for practice.",
    ar: "منصة تداول مجانية ومفتوحة المصدر ترسم النماذج الاحتمالية — volatility cones وbands ومراكز الخيارات — فوق الشارت المباشر، مع سوق محاكى مدمج للتدريب.",
  },
  sections: [
    {
      heading: { en: "The idea", ar: "الفكرة" },
      paragraphs: [
        {
          en: "Most retail platforms lean on lagging indicators such as RSI or MACD. Quantum Terminal shows where price is statistically likely to travel instead: probability envelopes built from the GBM, MJD and Bates models, drawn directly over live candles.",
          ar: "معظم منصات الأفراد تعتمد على مؤشرات متأخرة مثل RSI أو MACD. أما Quantum Terminal فيعرض المدى الذي يُرجَّح إحصائياً أن يتحرك فيه السعر: نطاقات احتمالية مبنية على نماذج GBM وMJD وBates، مرسومة مباشرة فوق الشموع الحية.",
        },
        {
          en: "The terminal is a display hub: heavy computations are prepared ahead of time, so the terminal itself stays fast and focused on live prices, charts and order management.",
          ar: "المنصة واجهة عرض: الحسابات الثقيلة تُجهَّز مسبقاً، فتبقى المنصة نفسها سريعة ومركّزة على الأسعار الحية والشارت وإدارة الأوامر.",
        },
      ],
    },
    {
      heading: { en: "The pages", ar: "صفحات المنصة" },
      bullets: [
        {
          en: "QUANT ANALYSIS — multi-chart workspace with cones, bands, GEX levels, drawing tools and the order ticket, plus a REPLAY mode.",
          ar: "QUANT ANALYSIS — مساحة عمل بعدة شارتات فيها cones وbands ومستويات GEX وأدوات الرسم وتذكرة الأوامر، مع وضع REPLAY.",
        },
        {
          en: "FUNDAMENTAL — macro regime, yields, VIX and economic events.",
          ar: "FUNDAMENTAL — النظام الاقتصادي الكلي (macro regime) والعوائد وVIX والأحداث الاقتصادية.",
        },
        {
          en: "MONEY FLOW — rotation of capital between sectors and countries.",
          ar: "MONEY FLOW — حركة رؤوس الأموال بين القطاعات والدول.",
        },
        {
          en: "OPTIONS QUANT — gamma exposure (GEX), max pain, call/put walls and dealer positioning.",
          ar: "OPTIONS QUANT — gamma exposure (GEX) وmax pain وجدران call/put ومراكز الـ dealers.",
        },
        {
          en: "STRESS LAB — the Pulse Room scanner and the Options Cockpit.",
          ar: "STRESS LAB — ماسح Pulse Room ولوحة Options Cockpit.",
        },
        {
          en: "LEARN — this Learning Center, in English and Arabic.",
          ar: "LEARN — مركز التعلم هذا، بالعربية والإنجليزية.",
        },
      ],
    },
    {
      heading: { en: "How it is built", ar: "كيف بُنيت المنصة" },
      bullets: [
        {
          en: "Backend — Python and FastAPI. Streams prices over WebSocket and serves a REST API on 127.0.0.1, so it is reachable from your own machine only.",
          ar: "الـ Backend — مكتوب بـ Python وFastAPI. يبث الأسعار عبر WebSocket ويقدّم REST API على العنوان 127.0.0.1، أي أنه متاح من جهازك فقط.",
        },
        {
          en: "Data providers — MetaTrader 5, Rithmic and the built-in simulated market all plug in behind one interface: supporting a new broker means writing one class.",
          ar: "مزودو البيانات — MetaTrader 5 وRithmic والسوق المحاكى المدمج تعمل كلها خلف واجهة واحدة، فدعم وسيط جديد يعني كتابة class واحد فقط.",
        },
        {
          en: "User interface — React, with TradingView Lightweight Charts for the candles. It runs in your browser or as a desktop app (Electron).",
          ar: "الواجهة — مبنية بـ React، وتستخدم TradingView Lightweight Charts لعرض الشموع. تعمل في المتصفح أو كتطبيق سطح مكتب (Electron).",
        },
      ],
    },
    {
      heading: { en: "Free and open source", ar: "مجاني ومفتوح المصدر" },
      paragraphs: [
        {
          en: "Quantum Terminal is released under the MIT license: no accounts, no subscriptions, every feature unlocked. The complete source — backend, user interface and desktop shell — is on GitHub at github.com/wJubran/QuantumTerminal, and contributions are welcome.",
          ar: "Quantum Terminal منشور بترخيص MIT: بلا حسابات ولا اشتراكات، وكل الميزات مفتوحة للجميع. الكود الكامل — الـ backend والواجهة وتطبيق سطح المكتب — موجود على GitHub في github.com/wJubran/QuantumTerminal، والمساهمات مرحّب بها.",
        },
      ],
    },
    {
      heading: { en: "Disclaimer", ar: "تنبيه" },
      paragraphs: [
        {
          en: "For education and analysis only. The models are probabilistic, not predictive, and trading financial markets carries a high level of risk.",
          ar: "للتعليم والتحليل فقط. النماذج احتمالية وليست تنبؤية، والتداول في الأسواق المالية ينطوي على مخاطر عالية.",
        },
      ],
    },
  ],
};
