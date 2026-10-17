// version: v4
// LearningCenter.jsx — foundation.
//
// v4 — Bilingual "Quantum Terminal" guide category (about, install,
//      simulator, data & security). First visit opens in Arabic when the
//      browser language is Arabic; the EN/AR toggle choice is remembered.
//
// Layout: top bar (search + EN/AR toggle) · left nav (categories + articles)
// · main (selected article).
//
// Content: pulled from ./articles/index.js at build time. Adding a new
// article file + pushing it into the ARTICLES array auto-populates the
// nav and the search index.
//
// Language: Arabic keeps every technical term in English (GBM stays GBM,
// GEX stays GEX, sigma stays sigma). Body prose is simplified Arabic so
// readers in the region don't need to translate jargon themselves.
// RTL direction is applied only to the article body when Arabic is active;
// the nav stays LTR so clickable items aren't disorienting.

import React, { useMemo, useState, useEffect } from "react";
import { CATEGORIES } from "./categories";
import { ARTICLES, SEARCH_INDEX } from "./articles";
import { VISUALS } from "./visuals";   // v3: inline SVG diagrams per section

// ── Theme (match Quantum Terminal palette, mono) ─────────────────────────────────
const C = {
  bg:        "#000",
  bgPanel:   "#0a0a0a",
  bgCard:    "#111",
  bgHover:   "#1a1a1a",
  border:    "#222",
  borderLt:  "#333",
  white:     "#fff",
  text:      "#e8ecf1",
  textSoft:  "#c5cdd9",
  gray:      "#999",
  muted:     "#6b7785",
  dim:       "#4d5866",
  orange:    "#ff6d00",
  green:     "#27c49a",
  amber:     "#f5a623",
  blue:      "#3796ff",
  proGold:     "#ffd89e",
  proGoldDeep: "#b8823d",
};
const mono = "'Courier New', 'SF Mono', 'Monaco', 'Consolas', monospace";

const LANG_KEY = "mk_learning_lang";
// v2: show the "under construction" disclaimer once per session so users
//     are reminded each time they launch the terminal, without nagging
//     them every time they click between tabs.
const DISCLAIMER_KEY = "mk_learning_disclaimer_seen";

// ── i18n helpers ──────────────────────────────────────────────────────────
const UI = {
  search_placeholder: {
    en: "Search across all articles…",
    ar: "ابحث في كل المقالات…",
  },
  select_article: {
    en: "Select an article from the left to begin reading.",
    ar: "اختر مقالاً من القائمة على اليسار لتبدأ القراءة.",
  },
  empty_hero_title: {
    en: "Learning Center",
    ar: "مركز التعلم",
  },
  empty_hero_sub: {
    en: "Reference for every page in Quantum Terminal, the quant models that drive it, and the trade setups the engines detect.",
    ar: "مرجع لكل صفحة في Quantum Terminal، النماذج الكمية التي تشغّلها، وأنواع الصفقات التي تكتشفها المحركات.",
  },
  no_results: {
    en: "No articles match your search.",
    ar: "لا توجد نتائج مطابقة.",
  },
  nothing_in_category: {
    en: "(no articles yet)",
    ar: "(لا توجد مقالات بعد)",
  },
  lang_toggle_to_arabic: "عربي",
  lang_toggle_to_english: "EN",
  tags_label: { en: "TAGS", ar: "الوسوم" },
  category_label: { en: "CATEGORY", ar: "التصنيف" },
  summary_label:  { en: "SUMMARY",  ar: "الملخص" },
};

function t(key, lang) {
  const entry = UI[key];
  if (!entry) return key;
  if (typeof entry === "string") return entry;
  return entry[lang] || entry.en || "";
}

// ── Search: simple contains + scoring ─────────────────────────────────────
function searchArticles(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return null; // no filter
  const results = [];
  for (const item of SEARCH_INDEX) {
    let score = 0;
    if (item.title_en.includes(q)) score += 10;
    if (item.title_ar.includes(q)) score += 10;
    if (item.tags.some(t => t.includes(q))) score += 5;
    if (item.body.includes(q)) score += 1;
    if (score > 0) results.push({ id: item.id, score });
  }
  results.sort((a, b) => b.score - a.score);
  return new Set(results.map(r => r.id));
}

// ── Sidebar nav ──────────────────────────────────────────────────────────
function Sidebar({ lang, selectedId, onSelect, filterIds, collapsedCats, onToggleCat }) {
  return (
    <aside style={{
      width: 280, flexShrink: 0,
      background: C.bgPanel,
      borderRight: `1px solid ${C.border}`,
      overflowY: "auto",
      fontFamily: mono,
    }}>
      {CATEGORIES.map(cat => {
        const items = ARTICLES
          .filter(a => a.category === cat.id)
          .filter(a => !filterIds || filterIds.has(a.id))
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        if (filterIds && items.length === 0) return null;
        const collapsed = !!collapsedCats[cat.id];
        return (
          <div key={cat.id} style={{ borderBottom: `1px solid ${C.border}` }}>
            <button
              onClick={() => onToggleCat(cat.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 14px", border: "none", cursor: "pointer",
                background: "transparent", textAlign: "left", fontFamily: mono,
                color: C.text,
              }}
            >
              <span style={{
                width: 18, textAlign: "center",
                color: C.proGold, fontSize: 13, fontWeight: 700,
              }}>{cat.icon}</span>
              <span style={{
                flex: 1, fontSize: 11, letterSpacing: "1.2px",
                textTransform: "uppercase", fontWeight: 700,
              }}>{lang === "ar" ? cat.ar : cat.en}</span>
              <span style={{ color: C.muted, fontSize: 10 }}>{collapsed ? "+" : "−"}</span>
            </button>
            {!collapsed && (
              items.length > 0 ? items.map(a => {
                const selected = a.id === selectedId;
                return (
                  <button
                    key={a.id}
                    onClick={() => onSelect(a.id)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "7px 16px 7px 44px", border: "none",
                      background: selected ? `${C.orange}18` : "transparent",
                      borderLeft: selected
                        ? `2px solid ${C.orange}`
                        : "2px solid transparent",
                      color: selected ? C.orange : C.textSoft,
                      fontFamily: mono, fontSize: 11,
                      cursor: "pointer", letterSpacing: "0.2px",
                    }}
                  >{lang === "ar" ? a.title.ar : a.title.en}</button>
                );
              }) : (
                <div style={{
                  padding: "6px 16px 10px 44px", color: C.dim,
                  fontSize: 10, fontStyle: "italic", fontFamily: mono,
                }}>{t("nothing_in_category", lang)}</div>
              )
            )}
          </div>
        );
      })}
    </aside>
  );
}

// ── Article view ─────────────────────────────────────────────────────────
function ArticleView({ article, lang }) {
  if (!article) return null;
  const rtl = lang === "ar";
  const pick = (obj) => (lang === "ar" ? obj?.ar || obj?.en : obj?.en || obj?.ar) || "";
  const category = CATEGORIES.find(c => c.id === article.category);
  const catLabel = category ? (lang === "ar" ? category.ar : category.en) : article.category;

  return (
    <article style={{
      padding: "24px 36px 60px 36px",
      maxWidth: 860, margin: "0 auto",
      color: C.textSoft, fontFamily: mono,
      direction: rtl ? "rtl" : "ltr",
      lineHeight: 1.75,
    }}>
      {/* Category tag */}
      <div style={{
        display: "inline-block",
        padding: "2px 8px", borderRadius: 2,
        background: `${C.orange}18`, color: C.orange,
        border: `1px solid ${C.orange}50`,
        fontSize: 9, letterSpacing: "1.5px", fontWeight: 800,
        marginBottom: 12, textTransform: "uppercase",
      }}>{catLabel}</div>

      {/* Title */}
      <h1 style={{
        fontSize: 24, color: C.white, fontWeight: 700,
        margin: "0 0 10px 0", letterSpacing: "0.3px",
        lineHeight: 1.3,
      }}>{pick(article.title)}</h1>

      {/* Summary */}
      {article.summary && (
        <div style={{
          padding: "10px 14px", marginBottom: 18,
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${C.proGold}`,
          borderRadius: 2,
          fontSize: 12, color: C.text, fontStyle: "italic",
        }}>{pick(article.summary)}</div>
      )}

      {/* Tags */}
      {article.tags?.length > 0 && (
        <div style={{
          display: "flex", gap: 6, flexWrap: "wrap",
          marginBottom: 20, direction: "ltr", // tags always LTR
        }}>
          {article.tags.map(tag => (
            <span key={tag} style={{
              padding: "1px 7px", fontSize: 9,
              background: C.bgCard, color: C.muted,
              border: `1px solid ${C.borderLt}`, borderRadius: 2,
              fontFamily: mono, letterSpacing: "0.3px",
            }}>#{tag}</span>
          ))}
        </div>
      )}

      {/* Sections */}
      {article.sections?.map((s, i) => {
        const VisualComp = s.visual ? VISUALS[s.visual] : null;
        return (
          <section key={i} style={{ marginBottom: 26 }}>
            <h2 style={{
              fontSize: 14, color: C.orange, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "1.5px",
              margin: "0 0 12px 0", paddingBottom: 6,
              borderBottom: `1px solid ${C.border}`,
            }}>{pick(s.heading)}</h2>
            {/* v3: inline SVG demonstration if this section references one */}
            {VisualComp && (
              <div style={{
                margin: "4px 0 14px 0",
                border: `1px solid ${C.border}`,
                borderRadius: 4,
                background: "#0a0a0a",
                direction: "ltr", // visuals are always LTR so arrows read correctly
              }}>
                <VisualComp lang={lang} />
              </div>
            )}
            {s.paragraphs?.map((p, j) => (
              <p key={j} style={{
                fontSize: 13, color: C.textSoft, margin: "0 0 10px 0",
              }}>{pick(p)}</p>
            ))}
            {s.bullets?.length > 0 && (
              <ul style={{
                listStyle: "none", padding: 0, margin: "6px 0 0 0",
              }}>
                {s.bullets.map((b, j) => (
                  <li key={j} style={{
                    fontSize: 13, color: C.textSoft, margin: "0 0 8px 0",
                    paddingInlineStart: 18, position: "relative",
                  }}>
                    <span style={{
                      position: "absolute", insetInlineStart: 0, top: 10,
                      width: 6, height: 6, borderRadius: "50%",
                      background: C.proGold,
                    }} />
                    {pick(b)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </article>
  );
}

// ── Empty state (no article selected) ─────────────────────────────────────
function EmptyState({ lang, onPickFirst }) {
  const rtl = lang === "ar";
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 40, fontFamily: mono, direction: rtl ? "rtl" : "ltr",
    }}>
      <div style={{
        maxWidth: 560, textAlign: "center",
        background: C.bgCard, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: "36px 30px", position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${C.proGold}, ${C.proGoldDeep}, ${C.orange})`,
        }} />
        <h2 style={{
          fontSize: 20, color: C.white, fontWeight: 700,
          margin: "0 0 12px 0",
        }}>{t("empty_hero_title", lang)}</h2>
        <p style={{
          fontSize: 12, color: C.textSoft, lineHeight: 1.7, margin: 0,
        }}>{t("empty_hero_sub", lang)}</p>
        <p style={{
          fontSize: 11, color: C.muted, marginTop: 18,
        }}>{t("select_article", lang)}</p>
        {onPickFirst && (
          <button
            onClick={onPickFirst}
            style={{
              marginTop: 18, padding: "6px 16px",
              background: `${C.orange}18`, color: C.orange,
              border: `1px solid ${C.orange}60`, borderRadius: 3,
              fontSize: 10, fontWeight: 800, letterSpacing: "1px",
              fontFamily: mono, cursor: "pointer",
            }}
          >{lang === "ar" ? "ابدأ من أول مقال" : "START WITH FIRST ARTICLE"}</button>
        )}
      </div>
    </div>
  );
}

// ── v2: Under-construction disclaimer modal ───────────────────────────────
// Shows both EN and AR simultaneously (not toggled) so readers don't miss
// the warning if they're viewing the wrong language.
function DisclaimerModal({ onDismiss }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 200,
      background: "rgba(0, 0, 0, 0.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 30, fontFamily: mono,
    }} onClick={onDismiss}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 560, width: "100%",
          background: C.bgCard,
          border: `1px solid ${C.amber}80`,
          borderRadius: 6,
          padding: "28px 30px 24px 30px",
          position: "relative", overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${C.amber}, ${C.orange})`,
        }} />

        {/* Header pill */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "4px 12px", borderRadius: 3,
          background: `${C.amber}18`, color: C.amber,
          border: `1px solid ${C.amber}60`,
          fontSize: 10, fontWeight: 800, letterSpacing: "1.3px",
          marginBottom: 18,
        }}>⚠ UNDER CONSTRUCTION</div>

        {/* English */}
        <div style={{ direction: "ltr", textAlign: "left", marginBottom: 16 }}>
          <h3 style={{
            fontSize: 14, color: C.white, fontWeight: 700,
            margin: "0 0 8px 0", letterSpacing: "0.3px",
          }}>Learning Center is still being built</h3>
          <p style={{
            fontSize: 12, color: C.textSoft, lineHeight: 1.7, margin: 0,
          }}>
            Articles are in active development. Some content may be incomplete, outdated, or misleading. Always cross-check against the live terminal before acting on anything you read here.
          </p>
        </div>

        {/* Divider */}
        <div style={{
          height: 1, background: C.border, margin: "14px 0",
        }} />

        {/* Arabic */}
        <div style={{ direction: "rtl", textAlign: "right", marginBottom: 20 }}>
          <h3 style={{
            fontSize: 14, color: C.white, fontWeight: 700,
            margin: "0 0 8px 0",
          }}>مركز التعلم قيد التطوير</h3>
          <p style={{
            fontSize: 12, color: C.textSoft, lineHeight: 1.7, margin: 0,
          }}>
            المقالات لا تزال في مرحلة الكتابة والمراجعة، وبعض المحتوى قد يكون ناقصاً أو قديماً أو غير دقيق. تحقق دائماً من المعلومات من المنصة مباشرة قبل التصرف بناءً على ما تقرأه هنا.
          </p>
        </div>

        <button
          onClick={onDismiss}
          style={{
            width: "100%",
            padding: "8px 14px",
            background: `${C.amber}20`, color: C.amber,
            border: `1px solid ${C.amber}80`, borderRadius: 3,
            fontSize: 11, fontWeight: 800, letterSpacing: "1.2px",
            fontFamily: mono, cursor: "pointer",
          }}
        >I UNDERSTAND · تم الفهم</button>
      </div>
    </div>
  );
}

// ── Top-level component ───────────────────────────────────────────────────
export default function LearningCenter() {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved) return saved;
    } catch { /* private mode */ }
    const browser = (typeof navigator !== "undefined" && navigator.language) || "";
    return browser.toLowerCase().startsWith("ar") ? "ar" : "en";
  });
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCats, setCollapsedCats] = useState({});
  // v2: disclaimer is session-scoped — shows once per terminal launch.
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    try { return sessionStorage.getItem(DISCLAIMER_KEY) !== "1"; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
  }, [lang]);

  const dismissDisclaimer = () => {
    try { sessionStorage.setItem(DISCLAIMER_KEY, "1"); } catch {}
    setShowDisclaimer(false);
  };

  const filterIds = useMemo(() => searchArticles(searchQuery), [searchQuery]);

  const visibleArticles = useMemo(() => {
    return ARTICLES
      .filter(a => !filterIds || filterIds.has(a.id))
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }, [filterIds]);

  const selectedArticle = useMemo(
    () => ARTICLES.find(a => a.id === selectedId) || null,
    [selectedId]
  );

  const toggleCat = (id) => setCollapsedCats(s => ({ ...s, [id]: !s[id] }));

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      background: C.bg, minHeight: 0,
      fontFamily: mono,
      position: "relative", // so the disclaimer modal can cover just this page
    }}>
      {showDisclaimer && <DisclaimerModal onDismiss={dismissDisclaimer} />}
      {/* ── Top bar: search + lang toggle ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px",
        background: C.bgPanel, borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{
          position: "relative", flex: 1, maxWidth: 520,
        }}>
          <span style={{
            position: "absolute", insetInlineStart: 10, top: "50%",
            transform: "translateY(-50%)",
            color: C.muted, fontSize: 11, pointerEvents: "none",
          }}>⌕</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t("search_placeholder", lang)}
            dir={lang === "ar" ? "rtl" : "ltr"}
            style={{
              width: "100%",
              background: C.bg, color: C.white,
              border: `1px solid ${C.borderLt}`, borderRadius: 3,
              padding: lang === "ar" ? "6px 28px 6px 12px" : "6px 12px 6px 28px",
              fontSize: 12, fontFamily: mono, outline: "none",
              letterSpacing: "0.2px",
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")}
              style={{
                position: "absolute", insetInlineEnd: 6, top: "50%",
                transform: "translateY(-50%)",
                background: "transparent", border: "none", color: C.muted,
                cursor: "pointer", fontSize: 12, padding: "2px 6px",
              }}
            >✕</button>
          )}
        </div>

        {filterIds && (
          <span style={{
            fontSize: 10, color: filterIds.size === 0 ? C.red : C.muted,
            letterSpacing: "0.5px",
          }}>
            {filterIds.size === 0
              ? t("no_results", lang)
              : `${filterIds.size} result${filterIds.size === 1 ? "" : "s"}`}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Language toggle */}
        <button
          onClick={() => setLang(l => l === "ar" ? "en" : "ar")}
          title="Toggle language / تبديل اللغة"
          style={{
            padding: "5px 14px",
            background: `${C.proGold}18`,
            color: C.proGold,
            border: `1px solid ${C.proGoldDeep}`,
            borderRadius: 3, fontSize: 10, fontWeight: 800,
            letterSpacing: "1px", fontFamily: mono, cursor: "pointer",
          }}
        >{lang === "ar" ? UI.lang_toggle_to_english : UI.lang_toggle_to_arabic}</button>
      </div>

      {/* ── Body: nav + content ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar
          lang={lang}
          selectedId={selectedId}
          onSelect={setSelectedId}
          filterIds={filterIds}
          collapsedCats={collapsedCats}
          onToggleCat={toggleCat}
        />

        <main style={{
          flex: 1, overflowY: "auto", background: C.bg,
        }}>
          {selectedArticle
            ? <ArticleView article={selectedArticle} lang={lang} />
            : <EmptyState
                lang={lang}
                onPickFirst={visibleArticles[0]
                  ? () => setSelectedId(visibleArticles[0].id)
                  : null}
              />}
        </main>
      </div>
    </div>
  );
}
