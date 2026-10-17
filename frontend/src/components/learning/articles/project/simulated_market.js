// Article: Simulated market & paper trading (backend/providers/sim_provider.py).
// Rule for Arabic body: keep every technical term in English (Bates, Heston,
// SL/TP, seed, etc.). Surrounding prose is simplified Arabic.

export default {
  id: "simulated_market",
  category: "project",
  order: 0.3,
  title: {
    en: "Simulated market & paper trading",
    ar: "السوق المحاكى والتداول الورقي",
  },
  tags: ["simulator", "sim", "paper trading", "demo", "bates", "practice", "محاكاة", "تداول ورقي"],
  summary: {
    en: "Practise without a broker: a realistic, reproducible market driven by the Bates model, with a paper account that behaves like a real one. Start it with python launcher.py --sim.",
    ar: "تدرّب بدون وسيط: سوق واقعي وقابل للتكرار يعتمد على نموذج Bates، مع حساب ورقي يتصرف مثل الحساب الحقيقي. شغّله بالأمر python launcher.py --sim.",
  },
  sections: [
    {
      heading: { en: "When to use it", ar: "متى تستخدمه" },
      bullets: [
        { en: "Learning the terminal before connecting a real account.", ar: "تعلّم المنصة قبل ربط حساب حقيقي." },
        { en: "Testing a trading idea or an order workflow at no risk.", ar: "تجربة فكرة تداول أو طريقة إدارة الأوامر بدون أي مخاطرة." },
        { en: "Demos, and development on macOS or Linux, where MetaTrader 5 is not available.", ar: "العروض التوضيحية، والتطوير على macOS أو Linux حيث لا يتوفر MetaTrader 5." },
      ],
    },
    {
      heading: { en: "How the prices are generated", ar: "كيف تُولَّد الأسعار" },
      paragraphs: [
        {
          en: "Prices follow the Bates model: stochastic volatility (Heston) plus random jumps (Merton) — the same model family behind the volatility cones. Volatility clusters, calm periods alternate with busy ones, and occasional jumps fatten the tails just like in real markets.",
          ar: "الأسعار تتبع نموذج Bates: تقلب عشوائي (Heston) مع قفزات عشوائية (Merton) — وهي نفس عائلة النماذج التي تُبنى عليها volatility cones. التقلب يتجمّع، وتتناوب الفترات الهادئة مع النشطة، وتظهر قفزات بين حين وآخر تجعل الـ tails أعرض تماماً كما في الأسواق الحقيقية.",
        },
      ],
      bullets: [
        {
          en: "Intraday rhythm: quiet Asian hours, busier London and New York opens.",
          ar: "إيقاع يومي: ساعات آسيوية هادئة، ونشاط أعلى عند افتتاح لندن ونيويورك.",
        },
        {
          en: "Consistent timeframes: every timeframe from M1 to W1 is built from the same minute bars, so the charts always agree, and history never changes when it is loaded again.",
          ar: "أطر زمنية متسقة: كل الأطر من M1 إلى W1 مبنية من نفس شموع الدقيقة، لذلك تتطابق الشارتات دائماً، والتاريخ لا يتغير عند إعادة تحميله.",
        },
        {
          en: "Reproducible: the same seed produces the same market on every computer. The simulated market trades 24/7.",
          ar: "قابل للتكرار: نفس الـ seed يُنتج نفس السوق على أي جهاز. والسوق المحاكى يعمل على مدار الساعة طوال الأسبوع.",
        },
      ],
    },
    {
      heading: { en: "The paper account", ar: "الحساب الورقي" },
      bullets: [
        {
          en: "Starts with 100,000 USD at 1:100 leverage.",
          ar: "يبدأ برصيد 100,000 دولار ورافعة 1:100.",
        },
        {
          en: "Market, limit and stop orders, stop loss / take profit, partial closes and margin checks, with profit and loss converted to USD.",
          ar: "أوامر market وlimit وstop، مع stop loss وtake profit، والإغلاق الجزئي، وفحص الهامش (margin)، وتحويل الأرباح والخسائر إلى الدولار.",
        },
        {
          en: "Stops are realistic: a stop is triggered if price touched it at any moment since the previous check — even a brief wick — not only at the latest price.",
          ar: "الـ stops واقعية: يُفعَّل الأمر إذا لمس السعر مستواه في أي لحظة منذ آخر فحص — حتى لو كان ذيل شمعة قصير — وليس فقط عند آخر سعر.",
        },
        {
          en: "Saved between sessions. Stops hit while the terminal was closed are applied the next time it starts.",
          ar: "يُحفظ بين الجلسات. والـ stops التي لُمست أثناء إغلاق المنصة تُطبَّق عند تشغيلها في المرة التالية.",
        },
        {
          en: "Seed, starting balance and leverage can be changed in user_config.json under providers.accounts.sim_default.",
          ar: "يمكن تغيير الـ seed والرصيد الابتدائي والرافعة من ملف user_config.json تحت providers.accounts.sim_default.",
        },
      ],
    },
    {
      heading: { en: "Important", ar: "مهم" },
      paragraphs: [
        {
          en: "Simulated prices are synthetic. While the simulator is active the header shows FEED ● SIMULATED in amber. Never treat these prices as market data.",
          ar: "أسعار المحاكاة اصطناعية. أثناء عمل المحاكي يظهر في أعلى المنصة FEED ● SIMULATED باللون الكهرماني. لا تعامل هذه الأسعار أبداً كبيانات سوق حقيقية.",
        },
      ],
    },
  ],
};
