import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { unified } from "@astrojs/markdown-remark";
import remarkCoursePageTitle from "./src/lib/remark-course-page-title.mjs";
import remarkCourseLinks from "./src/lib/remark-course-links.mjs";
import remarkModuleReadingBody from "./src/lib/remark-module-reading-body.mjs";
import rehypeWrapTables from "./src/lib/rehype-wrap-tables.mjs";
export default defineConfig({
  output: "static",
  site: process.env.SITE_URL || "http://localhost:4321", // set SITE_URL in production
  trailingSlash: "always",
  compressHTML: true,
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkCoursePageTitle,
        remarkCourseLinks,
        remarkModuleReadingBody,
      ],
      rehypePlugins: [rehypeWrapTables],
    }),
  },
  vite: { plugins: [tailwindcss()] },
});
