import manifest from "../generated/content-manifest.json";
export type RecordKind = "module" | "theory" | "practice";
export type Entry = {
  id: string;
  title: string;
  module: string;
  kind: RecordKind;
  group: string;
  level: string;
  status: string;
  stage: number;
  order: number;
  sources: string[];
  related_practice: string[];
  description?: string;
  outcome?: string;
  time?: string;
};
export const stages = manifest.stages as Array<{
  id: number;
  title: string;
  desc: string;
  weeks: string;
}>;
export const entries: Record<string, Entry> = manifest.entries as Record<
  string,
  Entry
>;
export const sources = manifest.sources as Array<{
  id: string;
  title: string;
  type: string;
  url: string;
  author: string;
  description: string;
}>;
export type EditorialReview = {
  recordId: string;
  documentId: string;
  claimId: string;
  claim: string;
  sourceIds: string[];
  checkedOn: string;
  scope: string;
  reviewer: string;
  reviewerRole: string;
  coverage: "selected_claims" | "full_document";
  reviewType: "editorial" | "legal" | "platform";
  status: "verified" | "needs_revision";
  specialistConfirmed?: boolean;
};
export const editorialReviews = manifest.editorialReviews as EditorialReview[];
export const all = Object.values(entries);
export const modules = all
  .filter((e) => e.kind === "module")
  .sort((a, b) => a.module.localeCompare(b.module));
export const lessons = all
  .filter((e) => e.kind === "theory")
  .sort((a, b) => a.id.localeCompare(b.id));
export const practices = all
  .filter((e) => e.kind === "practice")
  .sort((a, b) => a.id.localeCompare(b.id));
export const libraries = [
  {
    id: "glossary",
    title: "Глоссарий продаж",
    description: "Рабочие определения терминов и сокращений курса.",
    file: "GLOSSARY.md",
  },
  {
    id: "cases",
    title: "Сквозные учебные кейсы",
    description: "Вымышленные ситуации для разбора решений и ограничений.",
    file: "CASE_LIBRARY.md",
  },
  {
    id: "templates",
    title: "Рабочие шаблоны",
    description:
      "Редактируемые черновики сообщений, документов и рабочих записей.",
    file: "TEMPLATE_LIBRARY.md",
  },
] as const;
export const ofModule = (mod: string) =>
  all.filter((e) => e.module === mod).sort((a, b) => a.order - b.order);
export const href = (e: Entry) =>
  `/${e.kind === "theory" ? "lesson" : e.kind === "practice" ? "practice" : "module"}/${e.id}/`;
export const intro = (e: Entry) =>
  `${e.kind === "theory" ? "Теория" : e.kind === "practice" ? "Практика" : "Модуль"} · ${e.module}`;
export function neighbor(e: Entry) {
  const xs = e.kind === "theory" ? lessons : practices;
  const at = xs.findIndex((x) => x.id === e.id);
  return { previous: xs[at - 1], next: xs[at + 1] };
}

const libraryTopics: Record<(typeof libraries)[number]["id"], RegExp> = {
  glossary:
    /\b(?:b2b|b2c|b2g|spin|bant|spiced|meddpicc|icp|jtbd|crm|roi|cac|ltv|tco|nps|csat|rfp|batna|zopa)\b|воронк|метрик|квалификац|позиционирован|ценообразован|окупаемост|юнит.?эконом/i,
  cases:
    /клиент|покупател|ситуац|кейс|диалог|возражен|переговор|discovery|квалификац|заинтересованн|лид/i,
  templates:
    /сообщен|follow.?up|переписк|скрипт|шаблон|предложен|\bкп\b|бриф|карточк|чек.?лист|письменн|текстов|контакт|договор|предоплат|демонстрац|ответ на/i,
};

/** Return only the shared references that match the actual lesson/practice topic. */
export function relatedLibraries(entry: Entry) {
  const topic = `${entry.title} ${entry.group}`.toLocaleLowerCase("ru");
  return libraries.filter((library) => libraryTopics[library.id].test(topic));
}
