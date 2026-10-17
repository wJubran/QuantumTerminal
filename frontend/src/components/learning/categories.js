// version: v2
// Learning Center category list. Each article ships with a `category` id that
// matches one of these. Keep the list short at first — too many categories
// fragments the nav and confuses readers.
//
// v2: added "shortcuts" category — keyboard / mouse shortcuts reference page
//     sits last in the sidebar so it acts as a quick-reference appendix.
// v3: added "project" category first — the bilingual guide to Quantum
//     Terminal itself (what it is, install, simulator, data & security).

export const CATEGORIES = [
  { id: "project",        en: "Quantum Terminal",  ar: "دليل Quantum Terminal", icon: "◈" },
  { id: "terminal_pages", en: "Terminal Pages",    ar: "صفحات المنصة",        icon: "▣" },
  { id: "quant",          en: "Quant Knowledge",   ar: "المعرفة الكمية",        icon: "∑" },
  { id: "setups",         en: "Trade Setups",      ar: "أنواع الصفقات",        icon: "◎" },
  { id: "strategy",       en: "Strategy & Risk",   ar: "الاستراتيجية والمخاطر", icon: "⚖" },
  { id: "glossary",       en: "Glossary",          ar: "المصطلحات",            icon: "A" },
  { id: "shortcuts",      en: "Shortcuts",         ar: "الاختصارات",            icon: "⌨" },
];
