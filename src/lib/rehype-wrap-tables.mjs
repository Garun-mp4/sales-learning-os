/** Wrap rendered Markdown tables in the project's horizontal-scroll container. */
export default function rehypeWrapTables() {
  return (tree) => wrapTables(tree);
}

function wrapTables(parent) {
  if (!Array.isArray(parent.children)) return;

  let ignoreReferences = false;
  parent.children = parent.children.flatMap((child) => {
    if (child.type === "element" && /^h[23]$/.test(child.tagName)) {
      ignoreReferences =
        /Материалы для углубления|Источники для проверки|Рекомендуемые материалы/i.test(
          plainText(child),
        );
    }
    if (ignoreReferences && child.type === "element")
      child.properties = { ...child.properties, "data-pagefind-ignore": true };
    if (child.type === "element" && child.tagName === "table") {
      const rows = (child.children || []).flatMap(
        (section) => section.children || [],
      );
      const header = rows.find((row) =>
        row.children?.some((cell) => cell.tagName === "th"),
      );
      const labels =
        header?.children
          ?.filter((cell) => cell.tagName === "th")
          .map((cell) => plainText(cell)) || [];
      child.properties = { ...child.properties, role: "table" };
      for (const section of child.children || []) {
        section.properties = { ...section.properties, role: "rowgroup" };
        for (const row of section.children || []) {
          row.properties = { ...row.properties, role: "row" };
          (row.children || [])
            .filter((cell) => ["td", "th"].includes(cell.tagName))
            .forEach((cell, index) => {
              cell.properties = {
                ...cell.properties,
                role: cell.tagName === "th" ? "columnheader" : "cell",
                "data-label": labels[index] || "",
              };
            });
        }
      }
      return [
        {
          type: "element",
          tagName: "div",
          properties: {
            className: ["table-wrap"],
            role: "group",
            tabIndex: 0,
            "aria-label":
              "Широкая таблица. Используйте горизонтальную прокрутку, чтобы увидеть все столбцы.",
          },
          children: [child],
        },
      ];
    }

    if (
      child.type === "element" &&
      child.tagName === "input" &&
      child.properties?.type === "checkbox" &&
      child.properties?.disabled
    )
      return [];
    wrapTables(child);
    return [child];
  });
}

function plainText(node) {
  return node.type === "text"
    ? node.value
    : (node.children || []).map(plainText).join("");
}
