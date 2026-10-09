/** Parse the stable Markdown rubric table into fields for the local practice editor. */
export function parsePracticeRubric(markdown) {
  const source = String(markdown || "").split(/\r?\n/);
  const headingIndex = source.findIndex((line) =>
    /^##\s+Рубрика проверки(?:\s|$)/i.test(line.trim()),
  );
  if (headingIndex < 0) return [];

  const rows = [];
  for (let index = headingIndex + 1; index < source.length; index++) {
    const line = source[index].trim();
    if (/^#{1,2}\s/.test(line)) break;
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    const cells = line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((cell) => cell.replace(/\\\|/g, "|").trim());
    if (cells.length < 2 || cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
      continue;
    if (/^критерий(?: для этого задания)?$/i.test(cells[0])) continue;
    rows.push({
      id: `criterion-${rows.length + 1}`,
      label: cleanCell(cells[0]),
      description: cleanCell(cells[1]),
    });
  }
  return rows.filter((row) => row.label && row.description);
}

function cleanCell(value) {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
