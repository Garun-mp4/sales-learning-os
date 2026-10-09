export function quantity(count: number, forms: [string, string, string]) {
  const n = Math.abs(count) % 100;
  const form =
    n >= 11 && n <= 14
      ? 2
      : n % 10 === 1
        ? 0
        : n % 10 >= 2 && n % 10 <= 4
          ? 1
          : 2;
  return `${count} ${forms[form]}`;
}
export function studyLabel(kind: string, level: string) {
  if (kind === "practice")
    return level === "required"
      ? "Обязательное задание"
      : "Продвинутое задание";
  return level === "required"
    ? "Обязательное изучение"
    : "Продвинутое изучение";
}

export const sourceTypeLabels: Record<string, string> = {
  BOOKS: "Книги",
  STUDIES: "Исследования",
  COURSES: "Курсы",
  VIDEOS: "Видео",
  GUIDES_AND_LAWS: "Справочники и правила",
};
