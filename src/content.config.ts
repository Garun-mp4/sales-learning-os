import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

// All 430 learning documents are imported directly from the original Markdown
// with frontmatter validated BEFORE a static route can be generated.
const documents = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./sales-knowledge-base/modules" }),
  schema: z
    .object({
      id: z.string().regex(/^\d{2}-(?:\d{3}|P\d{2}|MODULE)$/),
      title: z.string().min(3),
      module: z.string().regex(/^\d{2}$/),
      kind: z.enum(["module", "theory", "practice"]),
      level: z.enum(["required", "advanced"]),
      group: z.string(),
      status: z.enum(["editorial_draft", "verified"]),
      sources: z.array(z.string()),
      related_practice: z.array(z.string()),
      updated: z.string().optional(),
    })
    .superRefine((v, ctx) => {
      const expected =
        v.kind === "module"
          ? `${v.module}-MODULE`
          : v.kind === "practice"
            ? new RegExp(`^${v.module}-P\\d{2}$`)
            : new RegExp(`^${v.module}-\\d{3}$`);
      if (
        typeof expected === "string" ? v.id !== expected : !expected.test(v.id)
      )
        ctx.addIssue({
          code: "custom",
          path: ["id"],
          message: "ID does not match module and kind",
        });
    }),
});

// These existing reference documents are also rendered directly from their
// Markdown sources instead of being duplicated into route components.
const libraries = defineCollection({
  loader: glob({
    pattern: "{GLOSSARY,CASE_LIBRARY,TEMPLATE_LIBRARY}.md",
    base: "./sales-knowledge-base",
  }),
  schema: z.object({
    id: z.enum(["glossary", "cases", "templates"]),
    title: z.string().min(3),
    kind: z.enum(["glossary", "cases", "templates"]),
    status: z.enum(["editorial_draft", "verified"]),
    updated: z.string(),
    sources: z.array(z.string()),
  }),
});

export const collections = { documents, libraries };
