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
