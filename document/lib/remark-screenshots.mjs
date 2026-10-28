import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');

/** Keep original URLs alongside Fumadocs static imports for framing and full-resolution zoom. */
export function remarkScreenshots({ publicDir = path.join(process.cwd(), 'public') } = {}) {
  return async (tree) => {
    async function visit(node) {
      const source =
        node.url ?? node.attributes?.find((attribute) => attribute.name === 'src')?.value;
      const prefix = ['/imgs/', 'https://cdn.jsdelivr.net/gh/labring/fastgpt-img@main/'].find(
        (prefix) => typeof source === 'string' && source.startsWith(`${prefix}optimized/`)
      );
      if (
        (node.name === 'img' || node.type === 'image') &&
        typeof source === 'string' &&
        prefix &&
        source.endsWith('.webp')
      ) {
        const original = source.replace(`${prefix}optimized/`, prefix).slice(0, -'.webp'.length);
        if (node.type === 'image') {
          // The international build rewrites URLs to CDN paths; read dimensions from its local asset.
          const { width, height } = await sharp(
            path.join(publicDir, 'imgs', source.slice(prefix.length))
          ).metadata();
          node.data ??= {};
          node.data.hProperties = {
            ...node.data.hProperties,
            'data-original-src': original,
            width,
            height
          };
        } else {
          node.attributes.push({
            type: 'mdxJsxAttribute',
            name: 'data-original-src',
            value: original
          });
        }
      }
      await Promise.all((node.children ?? []).map(visit));
    }
    await visit(tree);
  };
}
