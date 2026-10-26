// Budowa wydania do czytania: rozdziały, rozgrzewka, czas czytania i skróty streszczeń.
// Bez DOM, więc da się to sprawdzić w scripts/selftest.mjs.
import { SECTIONS, MAIN_SECTIONS, TIME_BUDGETS, WORDS_PER_MINUTE, FACT_KINDS } from './config.js';
import { formatShort, formatLong, addDays } from './dates.js';

export const sectionLabel = (id) => SECTIONS.find((s) => s.id === id)?.label || id;

// Pierwsze zdanie streszczenia (do widoku „Nagłówki”), z ominięciem skrótów typu „ul.”, „ok.”, „J.”.
const ABBREVIATIONS = new Set(['ul', 'al', 'pl', 'ok', 'tzw', 'np', 'r', 'godz', 'ks', 'św', 'prof', 'dr', 'gen', 'płk', 'art', 'nr', 'tys', 'mln', 'mld', 'zł', 'in', 'wg', 'ang', 'im', 'sen', 'min']);

export function firstSentence(text = '') {
  const re = /[.!?…](?=\s+[A-ZĄĆĘŁŃÓŚŹŻ„"(])/g;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index).split(/[\s(]/).pop();
    const word = before.split('.').pop();
    if (m[0] === '.' && (ABBREVIATIONS.has(word.toLowerCase()) || /^[A-ZĄĆĘŁŃÓŚŹŻ]$/.test(word))) continue;
    if (m.index < 30) continue;
    return text.slice(0, m.index + 1);
  }
  return text.length > 220 ? `${text.slice(0, 200).replace(/\s+\S*$/, '')}…` : text;
}

// ---------- Quiz z Twoich tematów ----------

// Rodzaj ciekawostki → dział o tym samym temacie (wybór działu też liczy się jako zainteresowanie).
const KIND_SECTIONS = { nauka: ['nauka'], przyroda: ['zwierzeta', 'srodowisko'], historia: ['historia'], kosmos: ['kosmos'], psychologia: ['psychologia'] };

// Pytania o ciekawostki zostają tylko z rodzajów wybranych w profilu (lub z odpowiadających im działów).
// Historia dnia, pojęcie i książka to stałe części wydania, więc ich pytania zostają zawsze.
export function personalQuiz(edition, profile) {
  const quiz = Array.isArray(edition?.quiz) ? edition.quiz : [];
  if (!profile) return quiz;
  const kinds = new Set(profile.factKinds || []);
  const sections = new Set(profile.sections || []);
  const liked = (kind) => kinds.has(kind) || (KIND_SECTIONS[kind] || []).some((s) => sections.has(s));
  return quiz.filter((q) => {
    const fact = (edition.facts || []).find((f) => f.id === q.ref);
    return !fact || liked(fact.kind);
  });
}

// Kopia wydania z quizem dopasowanym do profilu (reszta bez zmian).
export function withPersonalQuiz(edition, profile) {
  if (!edition?.quiz) return edition;
  return { ...edition, quiz: personalQuiz(edition, profile) };
}

// ---------- Budowa rozdziałów ----------

export function buildChapters(edition, profile, warmup = null) {
  const budget = TIME_BUDGETS[profile?.minutes] || TIME_BUDGETS[15];
  const wanted = new Set(profile?.sections || MAIN_SECTIONS);
  const bySection = {};
  for (const item of edition.news || []) (bySection[item.section] ||= []).push(item);
  for (const list of Object.values(bySection)) list.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  const chapters = [];
  if (warmup) {
    const yesterday = addDays(edition.date, -1);
    chapters.push({
      id: 'rozgrzewka',
      label: 'Rozgrzewka',
      title: warmup.prevDate === yesterday ? 'Test z wczoraj' : `Test z wydania ${formatShort(warmup.prevDate)}`,
      type: 'warmup',
    });
  }
  for (const id of MAIN_SECTIONS) {
    if (wanted.has(id) && bySection[id]?.length) {
      chapters.push({
        id,
        label: sectionLabel(id),
        title: id === 'polska' ? 'Polska: top 5' : 'Świat: top 5',
        type: 'news',
        groups: [{ section: id, items: bySection[id], limit: budget.top }],
      });
    }
  }

  const topics = SECTIONS.filter((s) => !MAIN_SECTIONS.includes(s.id) && wanted.has(s.id) && bySection[s.id]?.length);
  if (topics.length) {
    chapters.push({
      id: 'tematy',
      label: 'Twoje tematy',
      lead: topics.map((t) => t.label).join(' · '),
      type: 'topics',
      groups: topics.map((t) => ({ section: t.id, items: bySection[t.id], limit: budget.topic })),
    });
  }

  if (edition.facts?.length) {
    const pref = profile?.factKinds || [];
    const facts = [...edition.facts].sort((a, b) => rankKind(pref, a.kind) - rankKind(pref, b.kind));
    chapters.push({ id: 'ciekawostki', label: 'Ciekawostki', type: 'facts', items: facts, limit: budget.facts });
  }
  if (edition.onThisDay?.length) {
    chapters.push({ id: 'historia', label: 'Ten dzień w historii', type: 'otd', items: edition.onThisDay, limit: budget.otd });
  }
  if (edition.concept) chapters.push({ id: 'pojecie', label: 'Pojęcie dnia', type: 'concept' });
  if (edition.book) chapters.push({ id: 'ksiazka', label: 'Książka tygodnia', type: 'book' });
  if (edition.quiz?.length) chapters.push({ id: 'quiz', label: 'Quiz', title: 'Sprawdź się', type: 'quiz' });
  if (edition.evening) chapters.push({ id: 'wieczor', label: 'Na wieczór', title: 'Na wieczór', type: 'evening' });
  return chapters;
}

// ---------- Tekst dla lektora ----------
// Wspólny dla czytania głosem telefonu (views/today.js) i nagrań MP3 (scripts/make-audio.mjs),
// więc identyfikatory fragmentów w nagraniu zgadzają się z kartami w wydaniu.

const kindLabel = (id) => FACT_KINDS.find((k) => k.id === id)?.label || id;

// Fragmenty jednego rozdziału (albo jednego działu w „Twoich tematach”). Lektor czyta wszystko,
// także wpisy schowane pod „Pokaż więcej”; reveal to klucz listy, którą wtedy trzeba rozwinąć.
export function chapterNarration(ch, edition, onlyGroup = null) {
  const items = [];
  const add = (id, label, text, reveal = null) => items.push({ id, chapter: ch.id, label, text, reveal });
  if (ch.groups) {
    for (const g of ch.groups) {
      if (onlyGroup && g !== onlyGroup) continue;
      g.items.forEach((it, i) => {
        const lead = i === 0 ? `${sectionLabel(g.section)}. ` : '';
        add(it.id, it.title, `${lead}${it.title}. ${it.summary} ${it.why ? `Dlaczego to ważne: ${it.why}` : ''}`, i >= g.limit ? `news:${g.section}` : null);
      });
    }
  } else if (ch.type === 'facts' || ch.type === 'otd') {
    ch.items.forEach((it, i) => {
      const lead = i === 0 ? `${ch.label}. ` : '';
      const head = ch.type === 'otd' ? `Rok ${it.year}. ${it.title}.` : `${kindLabel(it.kind)}: ${it.title}.`;
      add(it.id, ch.type === 'otd' ? `${it.year}: ${it.title}` : it.title, `${lead}${head} ${it.body}`, i >= ch.limit ? ch.id : null);
    });
  } else if (ch.type === 'concept' && edition.concept) {
    const c = edition.concept;
    add('concept', `Pojęcie: ${c.term}`, `Pojęcie dnia: ${c.term}. ${c.definition} ${c.origin || ''} ${(c.examples || []).join(' ')}`);
  } else if (ch.type === 'book' && edition.book) {
    const b = edition.book;
    add('book', `${b.title}: ${b.ideaTitle}`, `Książka tygodnia: „${b.title}”, ${b.author}. Dzień ${b.day} z ${b.days}: ${b.ideaTitle}. ${b.idea} Morał: ${b.moral} Zastosuj dziś: ${b.action}`);
  } else if (ch.type === 'evening' && edition.evening) {
    add('evening', 'Na wieczór', `Na wieczór we dwoje: ${edition.evening.question} ${edition.evening.hint || ''}`);
  }
  return items.filter((it) => it.text.trim());
}

// Całe wydanie dla lektora: wstęp i wszystkie rozdziały do czytania (bez rozgrzewki i quizu, które wymagają dotknięć).
export function editionNarration(edition, chapters) {
  const first = chapters.find((c) => !['warmup', 'quiz'].includes(c.type));
  const intro = { id: 'intro', chapter: first?.id, label: 'Wstęp', text: `${formatLong(edition.date)}. ${edition.intro || ''}`, reveal: null };
  return [intro, ...chapters.flatMap((ch) => chapterNarration(ch, edition))].filter((it) => it.text.trim());
}

// Profil „wszystko” dla nagrań: wszystkie działy z wydania, wszystkie rodzaje ciekawostek.
export function narrationChapters(edition) {
  const sections = [...new Set((edition.news || []).map((n) => n.section))];
  return buildChapters(edition, { sections, factKinds: FACT_KINDS.map((k) => k.id), minutes: 20 });
}

// ---------- Rozgrzewka ----------

// 3 pytania a/b/c: z pola „recap” wydania (gdy czat je przygotował),
// a jeśli go nie ma – z quizu poprzedniego wydania, najpierw te z błędną odpowiedzią.
export function buildWarmup(edition, prevEdition, prevProgress) {
  if (Array.isArray(edition.recap) && edition.recap.length) {
    return edition.recap.slice(0, 3).map((q) => ({ ...q, fromTitle: q.fromTitle || null }));
  }
  if (!prevEdition?.quiz?.length) return [];
  const answers = prevProgress?.quiz || {};
  const score = (q) => (answers[q.id] === undefined ? 1 : answers[q.id] === q.answer ? 2 : 0);
  const ranked = prevEdition.quiz
    .map((q, i) => ({ q, i }))
    .sort((a, b) => score(a.q) - score(b.q) || a.i - b.i)
    .map((x) => x.q);
  return ranked.slice(0, 3).map((q) => toThreeOptions(q, findRef(prevEdition, q.ref)?.title));
}

function toThreeOptions(q, fromTitle) {
  const hsh = hash(q.id);
  const wrong = q.options.map((_, i) => i).filter((i) => i !== q.answer);
  const picked = wrong.length <= 2 ? wrong : [wrong[hsh % wrong.length], wrong[(hsh + 1) % wrong.length]];
  const idxs = [q.answer, ...picked];
  const r = hsh % idxs.length;
  const order = [...idxs.slice(r), ...idxs.slice(0, r)];
  return {
    id: q.id,
    ref: q.ref,
    question: q.question,
    options: order.map((i) => q.options[i]),
    answer: order.indexOf(q.answer),
    explanation: q.explanation,
    fromTitle: fromTitle || null,
  };
}

function hash(text) {
  let x = 0;
  for (const ch of String(text)) x = (x * 31 + ch.codePointAt(0)) >>> 0;
  return x;
}

function rankKind(pref, kind) {
  const i = pref.indexOf(kind);
  return i === -1 ? 99 : i;
}

function words(...texts) {
  return texts.filter(Boolean).join(' ').split(/\s+/).filter(Boolean).length;
}

export function estimateMinutes(chapters, edition, expanded) {
  let total = 0;
  for (const ch of chapters) {
    if (ch.groups) {
      for (const g of ch.groups) {
        const n = expanded.has(`news:${g.section}`) ? g.items.length : g.limit;
        for (const it of g.items.slice(0, n)) total += words(it.title, it.summary, it.why);
      }
    } else if (ch.items) {
      const n = expanded.has(ch.id) ? ch.items.length : ch.limit;
      for (const it of ch.items.slice(0, n)) total += words(it.title, it.body);
    } else if (ch.type === 'concept') {
      const c = edition.concept;
      total += words(c.term, c.definition, c.origin, ...(c.examples || []));
    } else if (ch.type === 'book') {
      const b = edition.book;
      total += words(b.ideaTitle, b.idea, b.moral, b.action);
    } else if (ch.type === 'quiz') {
      total += edition.quiz.length * 60;
    } else if (ch.type === 'warmup') {
      total += 3 * 50;
    } else if (ch.type === 'evening') {
      total += 120;
    }
  }
  return Math.max(1, Math.round(total / WORDS_PER_MINUTE));
}

export function findRef(edition, ref) {
  if (!ref) return null;
  const pools = [edition.facts, edition.onThisDay, edition.news].filter(Boolean).flat();
  const hit = pools.find((x) => x.id === ref);
  if (hit) return { title: hit.title };
  if (edition.concept?.id === ref) return { title: `Pojęcie: ${edition.concept.term}` };
  if (edition.book?.id === ref) return { title: `${edition.book.title}: ${edition.book.ideaTitle}` };
  return null;
}
