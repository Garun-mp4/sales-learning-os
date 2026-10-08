/** Remove curriculum lists duplicated by the module page's generated navigation. */
export default function remarkModuleReadingBody() {
  return (tree, file) => {
    const path = String(file.path || file).replaceAll("\\", "/");
    const isModule = path.endsWith("/00-module.md");
    const isLibrary = /\/(?:GLOSSARY|CASE_LIBRARY|TEMPLATE_LIBRARY)\.md$/i.test(path);
    if (!isModule && !isLibrary) return;

    const text = (node) => {
      if (node.type === "text" || node.type === "inlineCode") return node.value || "";
      return Array.isArray(node.children) ? node.children.map(text).join("") : "";
    };
    const isIndexSection = (node) => isModule &&
      node.type === "heading" && node.depth === 2 &&
      ["Порядок изучения", "Обязательная практика"].includes(
        text(node).trim().replace(/\s+/g, " "),
      );

    const firstHeading = tree.children.findIndex((node) => node.type === "heading");
    if (firstHeading >= 0 && tree.children[firstHeading].depth === 1) {
      tree.children.splice(firstHeading, 1);
    }

    for (let index = 0; index < tree.children.length; ) {
      if (!isIndexSection(tree.children[index])) {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (
        end < tree.children.length &&
        !(tree.children[end].type === "heading" && tree.children[end].depth <= 2)
      ) end += 1;
      tree.children.splice(index, end - index);
    }
  };
}
