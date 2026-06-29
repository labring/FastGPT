import { defineConfig, defineDocs, frontmatterSchema, metaSchema } from 'fumadocs-mdx/config';
import { z } from 'zod';

type MdxAstNode = {
  type: string;
  lang?: string;
  value?: string;
  children?: MdxAstNode[];
  [key: string]: unknown;
};

type MdxRoot = {
  type: 'root';
  children: MdxAstNode[];
};

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.vercel.app/docs/mdx/collections#define-docs
export const docs = defineDocs({
  dir: 'content',
  docs: {
    schema: frontmatterSchema.extend({
      title: z.string().optional().default('Untitled'),
      sidebarTag: z.string().optional()
    })
  },
  meta: {
    schema: metaSchema
  }
});

function remarkMermaid() {
  return (tree: MdxRoot) => {
    function visit(node: MdxRoot | MdxAstNode) {
      if (node.children) {
        node.children = node.children.map((child) => {
          if (child.type === 'code' && child.lang === 'mermaid') {
            return {
              type: 'mdxJsxFlowElement',
              name: 'MermaidDiagram',
              attributes: [
                {
                  type: 'mdxJsxAttribute',
                  name: 'chart',
                  value: child.value ?? ''
                }
              ],
              children: []
            };
          }

          visit(child);
          return child;
        });
      }
    }

    visit(tree);
  };
}

export default defineConfig({
  lastModifiedTime: 'git',
  mdxOptions: {
    remarkPlugins: (plugins) => [...plugins, remarkMermaid],
    remarkImageOptions: {
      external: false
    }
  }
});
