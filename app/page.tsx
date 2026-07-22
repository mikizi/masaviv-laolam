"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowSquareOut,
  BowlFood,
  Buildings,
  Compass,
  FlagBannerFold,
  GlobeHemisphereWest,
  Lightbulb,
  MagnifyingGlass,
  MapPin,
  Scroll,
  Sparkle,
  UsersThree,
  User,
  WarningCircle,
  X,
} from "@phosphor-icons/react/ssr";

type ApiCountry = {
  cca2: string;
  name: { common: string; official: string };
  translations?: Record<string, { common: string; official: string }>;
  capital?: string[];
  population?: number;
  flags: { svg: string; png: string; alt?: string };
  maps: { googleMaps: string };
  region: string;
  subregion?: string;
  area: number;
  languages?: Record<string, string>;
  currencies?: Record<string, { name: string; symbol?: string }>;
  flag?: string;
};

type WikiSearch = { title: string; snippet: string; url: string };
type Details = {
  leader: string;
  leaderImage: string;
  leaderSource: string;
  capital: string;
  countryImage: string;
  food: WikiSearch;
  war: WikiSearch;
  history: WikiSearch;
  population: number;
};

const stripHtml = (value = "") => value.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&");
const hebrewOnly = (value = "") => {
  const withoutForeignParentheses = value.replace(/\([^)]*[A-Za-z\u0600-\u06ff][^)]*\)/g, "");
  const cleaned = withoutForeignParentheses.split(/\s+/).filter((word) => !/[A-Za-z\u0600-\u06ff]/.test(word)).join(" ").replace(/\s+([,.;:])/g, "$1").trim();
  return (cleaned.match(/[\u0590-\u05ff]/g) || []).length > 8 ? cleaned : "לא נמצא תיאור בעברית למקור זה.";
};
const hebrewName = (country: ApiCountry) => {
  try { return new Intl.DisplayNames(["he"], { type: "region" }).of(country.cca2) || country.name.common; }
  catch { return country.name.common; }
};
const formatPopulation = (value: number) => new Intl.NumberFormat("he-IL", { notation: "compact", maximumFractionDigits: 1 }).format(value);

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function wikiSearch(query: string): Promise<WikiSearch> {
  const params = new URLSearchParams({ action: "query", list: "search", srsearch: query, srlimit: "1", format: "json", origin: "*", uselang: "he" });
  const data = await fetchJson(`https://he.wikipedia.org/w/api.php?${params}`);
  const result = data.query?.search?.[0];
  if (!result) return { title: "לא נמצא מקור מתאים", snippet: "המידע ההיסטורי עדיין אינו זמין למדינה זו.", url: "https://en.wikipedia.org" };
  return { title: result.title, snippet: hebrewOnly(stripHtml(result.snippet)), url: `https://he.wikipedia.org/wiki/${encodeURIComponent(result.title.replaceAll(" ", "_"))}` };
}

async function loadDetails(country: ApiCountry): Promise<Details> {
  const countryHe = hebrewName(country);
  const sparql = `SELECT ?head ?headLabel ?image ?capital ?capitalLabel WHERE { ?country wdt:P297 "${country.cca2}"; wdt:P6 ?head. OPTIONAL { ?head wdt:P18 ?image. } OPTIONAL { ?country wdt:P36 ?capital. } SERVICE wikibase:label { bd:serviceParam wikibase:language "he". } } LIMIT 1`;
  const leaderRequest = fetchJson(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`, { headers: { Accept: "application/sparql-results+json" } }).catch(() => null);
  const summaryRequest = fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(country.name.common)}`).catch(() => null);
  const populationRequest = fetchJson(`https://api.worldbank.org/v2/country/${country.cca2}/indicator/SP.POP.TOTL?format=json&mrnev=1`).catch(() => null);
  const [leaderData, summary, populationData, food, war, history] = await Promise.all([
    leaderRequest,
    summaryRequest,
    populationRequest,
    wikiSearch(`המאכל הלאומי של ${countryHe}`).catch(() => ({ title: "ויקיפדיה", snippet: "לא נמצא מידע זמין כרגע.", url: "https://he.wikipedia.org" })),
    wikiSearch(`מלחמות ${countryHe}`).catch(() => ({ title: "ויקיפדיה", snippet: "לא נמצא מידע זמין כרגע.", url: "https://he.wikipedia.org" })),
    wikiSearch(`ההיסטוריה הצבאית של ${countryHe}`).catch(() => ({ title: "ויקיפדיה", snippet: "לא נמצא מידע זמין כרגע.", url: "https://he.wikipedia.org" })),
  ]);
  const binding = leaderData?.results?.bindings?.[0];
  return {
    leader: binding?.headLabel?.value && !/^Q\d+$/.test(binding.headLabel.value) ? hebrewOnly(binding.headLabel.value) : "לא נמצא שם בעברית",
    leaderImage: binding?.image?.value || "",
    leaderSource: binding?.head?.value || "https://www.wikidata.org",
    capital: binding?.capitalLabel?.value || "לא נמצא במאגר",
    countryImage: summary?.originalimage?.source || summary?.thumbnail?.source || country.flags.svg,
    food,
    war,
    history,
    population: populationData?.[1]?.[0]?.value || country.population || 0,
  };
}

function InfoCard({ icon, label, children, wide = false, tone = "blue" }: { icon: React.ReactNode; label: string; children: React.ReactNode; wide?: boolean; tone?: string }) {
  return <article className={`info-card${wide ? " wide" : ""} tone-${tone}`}><span className="card-icon" aria-hidden="true">{icon}</span><div><p className="card-label">{label}</p><div className="card-value">{children}</div></div></article>;
}

export default function Home() {
  const [countries, setCountries] = useState<ApiCountry[]>([]);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<ApiCountry | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetch("https://raw.githubusercontent.com/mledoze/countries/master/countries.json")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((items: ApiCountry[]) => {
        const normalized = items.filter((item) => item.cca2).map((item) => ({
          ...item,
          flags: { svg: `https://flagcdn.com/${item.cca2.toLowerCase()}.svg`, png: `https://flagcdn.com/w320/${item.cca2.toLowerCase()}.png`, alt: `Flag of ${item.name.common}` },
          maps: { googleMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name.common)}` },
        }));
        const sorted = normalized.sort((a, b) => hebrewName(a).localeCompare(hebrewName(b), "he"));
        setCountries(sorted);
        return null;
      })
      .then((result) => result && setDetails(result))
      .catch(() => setError("לא הצלחנו להתחבר למאגר המדינות. נסו לרענן את הדף."))
      .finally(() => setLoading(false));
  }, []);

  const suggestions = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];
    return countries.filter((item) => `${hebrewName(item)} ${item.name.common} ${item.name.official}`.toLowerCase().includes(clean)).slice(0, 8);
  }, [countries, query]);

  async function chooseCountry(item: ApiCountry) {
    setCountry(item); setQuery(""); setDetails(null); setLoading(true); setShowHistory(false); setError("");
    try { setDetails(await loadDetails(item)); } catch { setError("חלק מהמידע לא נטען כרגע. נסו שוב בעוד רגע."); }
    finally { setLoading(false); }
  }

  const fact = country ? `השטח של ${hebrewName(country)} הוא כ־${new Intl.NumberFormat("he-IL").format(Math.round(country.area))} קמ״ר, ומדברים בה ${Object.values(country.languages || {}).length || 1} שפות רשמיות.` : "";

  return <main dir="rtl" style={{ "--country": "#2457d6" } as React.CSSProperties}>
    <header className="topbar"><a className="brand" href="#top"><GlobeHemisphereWest weight="duotone" size={34} /><b>מסביב לעולם</b></a><span className="parent-note"><Sparkle weight="fill" /> מדריך לכל מדינות העולם</span></header>
    <section className="hero-reference" id="top">
      <h1 className="sr-only">מסביב לעולם — מגלים מדינות בסקרנות</h1>
      <img src="./og.png" alt="מסביב לעולם — גלובוס צבעוני, מטוס, דגלים וחותמות מסע" />
      <p className="entry-note">בחרו מדינה והתחילו את המסע</p>
    </section>

    <section className="universal-search" aria-label="חיפוש כל מדינה בעולם">
      <div className="search-shell">
        <MagnifyingGlass className="search-icon" weight="bold" aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="למשל: יפן, ברזיל, צרפת..." aria-label="הקלידו שם מדינה" autoComplete="off" />
        {query && <button onClick={() => setQuery("")} aria-label="ניקוי החיפוש"><X weight="bold" /></button>}
        {suggestions.length > 0 && <div className="suggestions" role="listbox">{suggestions.map((item) => <button key={item.cca2} onClick={() => chooseCountry(item)} role="option"><img src={item.flags.svg} alt="" /><span><b>{hebrewName(item)}</b></span><ArrowLeft weight="bold" /></button>)}</div>}
        {query && !suggestions.length && countries.length > 0 && <div className="suggestions no-result">לא מצאנו מדינה בשם הזה. נסו איות אחר.</div>}
      </div>
      <p>{countries.length ? `${countries.length} מדינות וטריטוריות זמינות לחיפוש` : "טוענים את מפת העולם..."}</p>
    </section>

    {error && <div className="error-message"><WarningCircle weight="duotone" /> {error}</div>}
    {loading && !country && <div className="page-loader"><GlobeHemisphereWest weight="duotone" /><b>אוספים מידע מכל העולם...</b></div>}

    {country && <>
      <section className={`country-hero${loading ? " is-loading" : ""}`}>
        <img src={details?.countryImage || country.flags.svg} alt={`תמונה של ${hebrewName(country)}`} />
        <div className="photo-shade" />
        <div className="country-title"><span className="big-flag"><img src={country.flags.svg} alt={`דגל ${hebrewName(country)}`} /></span><div><p>שלום מ...</p><h2>{hebrewName(country)}</h2></div></div>
        <a className="map-button" href={country.maps.googleMaps} target="_blank" rel="noreferrer"><MapPin weight="fill" /> פתחו במפה <ArrowSquareOut weight="bold" /></a>
        {loading && <div className="loading-overlay"><MagnifyingGlass weight="bold" /> מחפשים מידע אמין...</div>}
      </section>

      <section className="facts-grid" aria-live="polite">
        <InfoCard icon={<Buildings weight="duotone" />} label="עיר הבירה" tone="red"><strong>{details?.capital || "בודקים..."}</strong></InfoCard>
        <InfoCard icon={<UsersThree weight="duotone" />} label="כמה תושבים?" tone="green"><strong>{details?.population ? formatPopulation(details.population) : "בודקים..."}</strong>{details?.population ? <small>{new Intl.NumberFormat("he-IL").format(details.population)} לפי נתון הבנק העולמי האחרון</small> : null}</InfoCard>
        <article className="leader-card">
          <div className="portrait-wrap"><User weight="duotone" />{details?.leaderImage && <img src={details.leaderImage} alt={`תמונה של ${details.leader}`} />}</div>
          <div><p className="card-label">מי מנהיג את הממשלה?</p><h3>{details?.leader || (loading ? "בודקים..." : "לא נמצא במאגר")}</h3><a href={details?.leaderSource} target="_blank" rel="noreferrer">למקור הנתונים ↗</a></div>
        </article>
        <InfoCard icon={<BowlFood weight="duotone" />} label="המאכל הלאומי" wide tone="yellow"><p>{details?.food.snippet || "מחפשים במקורות..."}</p>{details && <a className="source-link" href={details.food.url} target="_blank" rel="noreferrer">למקור המלא ↗</a>}</InfoCard>
        <InfoCard icon={<Lightbulb weight="duotone" />} label="עובדה מעניינת" wide tone="blue"><p>{fact}</p></InfoCard>
        <InfoCard icon={<FlagBannerFold weight="duotone" />} label="המלחמה האחרונה" wide tone="red"><p>{details?.war.snippet || "מחפשים במקורות היסטוריים..."}</p>{details && <a className="source-link" href={details.war.url} target="_blank" rel="noreferrer">למקור ההיסטורי ↗</a>}</InfoCard>
        <article className="history-card">
          <div className="history-head"><span className="card-icon"><Scroll weight="duotone" /></span><div><p className="card-label">שאלה מההיסטוריה</p><h3>האם {hebrewName(country)} כבשה פעם מדינה אחרת?</h3></div></div>
          <button onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>{showHistory ? "הסתירו תשובה" : "בדקו במקור ההיסטורי"}<span>{showHistory ? "−" : "+"}</span></button>
          {showHistory && <div className="history-answer"><strong>לא תמיד יש תשובת כן או לא פשוטה</strong><p>{details?.history.snippet || "המקור עדיין נטען."}</p>{details && <a className="source-link" href={details.history.url} target="_blank" rel="noreferrer">למקור ההיסטורי המלא ↗</a>}</div>}
        </article>
      </section>
      <aside className="context-note"><Compass weight="duotone" /><p><strong>חשוב לדעת:</strong> רשימת המדינות מגיעה ממאגר מדינות פתוח, נתוני האוכלוסייה מהבנק העולמי, והמנהיג והנושאים ההיסטוריים נשלפים בזמן אמת מוויקינתונים ומוויקיפדיה. בנושאי מלחמה וכיבוש כדאי לקרוא את המקור המלא ולשמוע כמה נקודות מבט.</p></aside>
    </>}
    <footer><GlobeHemisphereWest weight="duotone" /><p>לומדים על העולם בסקרנות, בכבוד ובאהבה</p><small>המידע מתעדכן ממקורות פתוחים ועשוי להשתנות. כדאי לאמת עובדות חשובות במקור נוסף.</small></footer>
  </main>;
}
