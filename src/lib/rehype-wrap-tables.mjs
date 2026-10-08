/** Wrap rendered Markdown tables in the project's horizontal-scroll container. */
export default function rehypeWrapTables() {
  return (tree) => wrapTables(tree);
}

function wrapTables(parent) {
  if (!Array.isArray(parent.children)) return;

  parent.children = parent.children.flatMap((child) => {
    if (child.type === "element" && child.tagName === "table") {
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

    wrapTables(child);
    return [child];
  });
}
