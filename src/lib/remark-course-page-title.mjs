/** Keep the route heading as the only H1; source Markdown titles live in frontmatter. */
export default function remarkCoursePageTitle() {
  return (tree) => {
    if (!Array.isArray(tree.children)) return;
    const titleIndex = tree.children.findIndex(
      (node) => node.type === "heading" && node.depth === 1,
    );
    if (titleIndex >= 0) tree.children.splice(titleIndex, 1);
  };
}
