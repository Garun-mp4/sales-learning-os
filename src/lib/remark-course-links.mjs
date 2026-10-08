/** Rewrites curriculum Markdown links to the actual Astro static routes.
 * Source Markdown remains untouched. The plugin runs while Astro renders it.
 * A link such as `theory/01-001.md` on the module overview must not remain
 * a broken `.md` URL when the document is published at /module/01-MODULE/.
 */
import path from 'node:path';

export function routeForMarkdownLink(url, currentFile) {
  if (typeof url !== 'string') return url;
  const match = /^([^?#]+\.md)(#[^?]*)?(\?[^#]*)?$/i.exec(url);
  if (!match) return url;
  const [ , relative, anchor = '', query = '' ] = match;
  if (/^[a-z][a-z\d+.-]*:/i.test(relative) || relative.startsWith('/')) return url;
  const absolute = path.resolve(path.dirname(currentFile), decodeURI(relative));
  const name = path.basename(absolute, '.md');
  const parent = path.basename(path.dirname(absolute));
  let route;
  if (/^\d{2}-\d{3}$/.test(name) && parent === 'theory') route = `/lesson/${name}/`;
  else if (/^\d{2}-P\d{2}$/.test(name) && parent === 'practice') route = `/practice/${name}/`;
  else if (name === '00-module') {
    const mod = /^\d{2}/.exec(parent)?.[0];
    if (mod) route = `/module/${mod}-MODULE/`;
  }
  return route ? `${route}${query}${anchor}` : url;
}

export default function remarkCourseLinks() {
  return (tree, file) => {
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'link' || node.type === 'definition') {
        node.url = routeForMarkdownLink(node.url, file.path || String(file));
      }
      if (Array.isArray(node.children)) node.children.forEach(walk);
    }
    walk(tree);
  };
}
