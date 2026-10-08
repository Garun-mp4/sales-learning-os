import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import remarkCourseLinks from './src/lib/remark-course-links.mjs';
export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL || 'http://localhost:4321', // set SITE_URL in production
  trailingSlash: 'always',
  integrations: [react()],
  markdown: { remarkPlugins: [remarkCourseLinks] },
  vite: { plugins: [tailwindcss()] },
});
