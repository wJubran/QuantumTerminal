// Article: Keyboard & Mouse Shortcuts
//
// Reference card for every shortcut the consumer terminal recognises.
// Sits as the last article in the Learning Center so it acts as an
// appendix — quick lookup when a user wonders "is there a shortcut for
// this?".
//
// Each bullet is formatted as "KEY  —  description" so the key reads
// like a label even though the renderer doesn't support real tables.

export default {
  id: "shortcuts_reference",
  category: "shortcuts",
  order: 1,
  title: {
    en: "Keyboard & Mouse Shortcuts",
    ar: "اختصارات لوحة المفاتيح والفأرة",
  },
  tags: ["shortcuts", "keyboard", "mouse", "hotkeys"],
  summary: {
    en: "Every keyboard and mouse shortcut the terminal recognises, grouped by where you'll use them. Shortcuts only fire when no input field is focused (so typing in the search box never triggers chart actions).",
    ar: "كل اختصارات لوحة المفاتيح والفأرة التي تتعرّف عليها المنصة، مرتّبة حسب مكان استخدامها. الاختصارات تعمل فقط عندما لا يكون أي حقل إدخال مفعّلاً (الكتابة في مربع البحث لا تشغّل أوامر الشارت).",
  },
  sections: [
    {
      heading: { en: "Charts & navigation", ar: "الشارت والتنقل" },
      paragraphs: [
        {
          en: "Active when you're on the Quant Analysis page with a chart focused. None of these fire while a text field has focus.",
          ar: "تعمل عندما تكون على صفحة Quant Analysis مع شارت مفعّل. لا تعمل أثناء كتابة في أي حقل نصي.",
        },
      ],
      bullets: [
        {
          en: "↑ / ↓  —  Navigate between tickers in the active list (wraps around at the ends).",
          ar: "↑ / ↓  —  التنقل بين الـ tickers في القائمة المفعّلة (يلتفّ عند الطرفين).",
        },
        {
          en: "1  —  Switch to M1 timeframe.",
          ar: "1  —  التبديل إلى timeframe M1.",
        },
        {
          en: "2  —  Switch to M5 timeframe.",
          ar: "2  —  التبديل إلى timeframe M5.",
        },
        {
          en: "3  —  Switch to M15 timeframe.",
          ar: "3  —  التبديل إلى timeframe M15.",
        },
        {
          en: "4  —  Switch to H1 timeframe.",
          ar: "4  —  التبديل إلى timeframe H1.",
        },
        {
          en: "5  —  Switch to H4 timeframe.",
          ar: "5  —  التبديل إلى timeframe H4.",
        },
        {
          en: "6  —  Switch to D1 timeframe.",
          ar: "6  —  التبديل إلى timeframe D1.",
        },
        {
          en: "B  —  Toggle bands overlay on/off.",
          ar: "B  —  تشغيل/إيقاف طبقة الـ bands.",
        },
        {
          en: "S  —  Toggle signal markers on/off.",
          ar: "S  —  تشغيل/إيقاف علامات الـ signals.",
        },
        {
          en: "C  —  Toggle all cones on/off.",
          ar: "C  —  تشغيل/إيقاف كل الـ cones.",
        },
        {
          en: "A  —  Toggle all anchors on/off.",
          ar: "A  —  تشغيل/إيقاف كل الـ anchors.",
        },
        {
          en: "Esc  —  Deselect the active ticker, close any open settings panel, or cancel a drawing tool currently being placed.",
          ar: "Esc  —  إلغاء تحديد الـ ticker، إغلاق أي إعدادات مفتوحة، أو إلغاء أداة الرسم النشطة.",
        },
      ],
    },
    {
      heading: { en: "Drawing tools", ar: "أدوات الرسم" },
      paragraphs: [
        {
          en: "Active while a drawing exists or a drawing tool is in use on the main chart.",
          ar: "تعمل عندما يكون هناك رسم موجود أو أداة رسم مفعّلة على الشارت الرئيسي.",
        },
      ],
      bullets: [
        {
          en: "Esc  —  Cancel the drawing tool currently in use, or exit chart fullscreen mode.",
          ar: "Esc  —  إلغاء أداة الرسم الحالية، أو الخروج من وضع ملء الشاشة.",
        },
        {
          en: "Delete or Backspace  —  Delete the currently selected drawing.",
          ar: "Delete أو Backspace  —  حذف الرسم المحدّد حالياً.",
        },
        {
          en: "Click on a drawing  —  Select it (handles appear). Click empty chart space to deselect.",
          ar: "النقر على رسم  —  تحديده (تظهر مقابض التحرير). النقر على مساحة فارغة لإلغاء التحديد.",
        },
      ],
    },
    {
      heading: { en: "Forms & dialogs", ar: "النماذج والنوافذ" },
      bullets: [
        {
          en: "Enter  —  Submit the current form (Sign in, Register, OTP code, Forgot Password, Reset Password, Verify Email recovery, and Continue from the Account page if you have access).",
          ar: "Enter  —  إرسال النموذج الحالي (تسجيل الدخول، التسجيل، رمز OTP، نسيت كلمة المرور، إعادة تعيين، استرداد التحقق، Continue من صفحة الحساب).",
        },
        {
          en: "Esc  —  Close the current popup menu (right-click context menus, swap-page menu in detached windows, asset picker dropdown).",
          ar: "Esc  —  إغلاق القائمة المنبثقة الحالية (قوائم النقر بزر الفأرة الأيمن، قائمة تبديل الصفحة في النوافذ المنفصلة، قائمة اختيار الأصول).",
        },
        {
          en: "Tab  —  Move focus to the next input field (standard browser behaviour).",
          ar: "Tab  —  نقل التركيز إلى الحقل التالي (سلوك المتصفح الافتراضي).",
        },
      ],
    },
    {
      heading: { en: "OTP code entry", ar: "إدخال رمز OTP" },
      paragraphs: [
        {
          en: "On any verification screen with the six-box OTP input.",
          ar: "في أي شاشة تحقّق فيها صناديق OTP الستة.",
        },
      ],
      bullets: [
        {
          en: "Type a digit  —  Auto-advances to the next box.",
          ar: "اكتب رقماً  —  ينتقل تلقائياً إلى الصندوق التالي.",
        },
        {
          en: "Backspace on an empty box  —  Goes back to the previous box and clears it.",
          ar: "Backspace على صندوق فارغ  —  يعود إلى الصندوق السابق ويفرّغه.",
        },
        {
          en: "Paste a 6-digit code  —  Fills all six boxes at once (works from email or messaging apps).",
          ar: "لصق رمز من 6 أرقام  —  يملأ كل الصناديق دفعة واحدة (يعمل من البريد أو تطبيقات المراسلة).",
        },
      ],
    },
    {
      heading: { en: "Multi-window (detach)", ar: "النوافذ المتعدّدة" },
      paragraphs: [
        {
          en: "Right-click affordances added so any top-level page can run as its own window — useful on multi-monitor setups.",
          ar: "إمكانيات نقر بزر الفأرة الأيمن لتشغيل أي صفحة رئيسية في نافذة مستقلة — مفيد على الشاشات المتعدّدة.",
        },
      ],
      bullets: [
        {
          en: "Right-click on any top-nav tab (Quant Analysis, Money Flow, Options Quant, Stress Lab, Learn, Fundamental)  —  Opens a small menu with 'Open in New Window'. Picking it spawns a separate window showing only that page.",
          ar: "نقر بزر الفأرة الأيمن على أي تبويب علوي (Quant Analysis, Money Flow, Options Quant, Stress Lab, Learn, Fundamental)  —  تظهر قائمة صغيرة فيها 'Open in New Window'. اختيارها يفتح نافذة جديدة تعرض تلك الصفحة فقط.",
        },
        {
          en: "Right-click on the orange border of a detached window  —  Opens a Switch Page menu so you can change which page that window shows without closing it.",
          ar: "نقر بزر الفأرة الأيمن على الإطار البرتقالي للنافذة المنفصلة  —  تظهر قائمة Switch Page لتغيير الصفحة المعروضة دون إغلاق النافذة.",
        },
        {
          en: "Closing the main window  —  Closes every detached window automatically; the app fully exits.",
          ar: "إغلاق النافذة الرئيسية  —  يُغلق كل النوافذ المنفصلة تلقائياً؛ التطبيق يخرج بالكامل.",
        },
        {
          en: "Closing a single detached window  —  Only closes that window; main and other detached windows continue running.",
          ar: "إغلاق نافذة منفصلة واحدة  —  يُغلق تلك النافذة فقط؛ النافذة الرئيسية والنوافذ الأخرى تبقى تعمل.",
        },
      ],
    },
    {
      heading: { en: "Mouse on the chart", ar: "الفأرة على الشارت" },
      bullets: [
        {
          en: "Scroll wheel  —  Zoom in/out on the chart's time axis.",
          ar: "عجلة التمرير  —  تكبير/تصغير على المحور الزمني للشارت.",
        },
        {
          en: "Click and drag empty chart  —  Pan the visible time range left/right.",
          ar: "النقر والسحب على مساحة فارغة في الشارت  —  تحريك النطاق الزمني المرئي يميناً/يساراً.",
        },
        {
          en: "Click and drag the price scale (right edge)  —  Stretch or compress the price axis.",
          ar: "النقر والسحب على مقياس السعر (الحافة اليمنى)  —  تمديد أو ضغط محور السعر.",
        },
        {
          en: "Double-click on the price scale  —  Reset the price axis to auto-scale.",
          ar: "النقر المزدوج على مقياس السعر  —  إعادة محور السعر إلى auto-scale.",
        },
        {
          en: "Hover over a candle  —  Tooltip shows OHLC values + any overlay readings (cone widths, GEX levels, regime label).",
          ar: "تمرير الفأرة فوق شمعة  —  يظهر tooltip فيه قيم OHLC وقراءات الطبقات (عرض الـ cones، مستويات GEX، اسم الـ regime).",
        },
      ],
    },
    {
      heading: { en: "App window controls", ar: "تحكم نافذة التطبيق" },
      paragraphs: [
        {
          en: "Standard Windows / Electron shortcuts that work anywhere in the app.",
          ar: "اختصارات Windows / Electron القياسية التي تعمل في أي مكان في التطبيق.",
        },
      ],
      bullets: [
        {
          en: "F12  —  Toggle developer tools. Available in development builds; disabled in production installers (turn it back on by editing electron/main.js if needed).",
          ar: "F12  —  تشغيل/إيقاف أدوات المطور. متاح في إصدارات التطوير؛ معطّل في الإصدارات النهائية.",
        },
        {
          en: "Ctrl+R or F5  —  Reload the current window. Detached windows preserve their assigned page across reload (URL parameter persists).",
          ar: "Ctrl+R أو F5  —  إعادة تحميل النافذة الحالية. النوافذ المنفصلة تحتفظ بصفحتها بعد إعادة التحميل.",
        },
        {
          en: "Ctrl + + / Ctrl + −  —  Zoom the entire UI in/out.",
          ar: "Ctrl + + / Ctrl + −  —  تكبير/تصغير الواجهة بالكامل.",
        },
        {
          en: "Ctrl+0  —  Reset UI zoom to 100%.",
          ar: "Ctrl+0  —  إعادة الزوم إلى 100%.",
        },
        {
          en: "Alt+F4  —  Close the current window (the standard Windows shortcut).",
          ar: "Alt+F4  —  إغلاق النافذة الحالية (اختصار Windows القياسي).",
        },
      ],
    },
    {
      heading: { en: "Notes", ar: "ملاحظات" },
      bullets: [
        {
          en: "Letter shortcuts (B, S, C, A) are case-insensitive — Caps Lock doesn't matter.",
          ar: "اختصارات الحروف (B, S, C, A) لا تفرّق بين الكبيرة والصغيرة — Caps Lock لا يؤثّر.",
        },
        {
          en: "If a shortcut isn't responding, check whether you have an input field focused (an orange border around an input means it has focus). Click empty chart space to release focus.",
          ar: "إذا اختصار لا يستجيب، تأكد من أنه لا يوجد حقل إدخال مفعّل (الإطار البرتقالي حول الحقل يعني أنه مفعّل). انقر على مساحة فارغة في الشارت لإلغاء التركيز.",
        },
        {
          en: "Shortcuts are global per window — each detached window has its own set independent of the main window.",
          ar: "الاختصارات global لكل نافذة — كل نافذة منفصلة لها مجموعتها الخاصة المستقلّة عن النافذة الرئيسية.",
        },
      ],
    },
  ],
};
