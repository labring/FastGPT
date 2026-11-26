/** Preserve theme variants after Fumadocs rewrites local images into static imports. */
export function remarkDiagrams() {
  return (tree) => {
    function visit(node) {
      const source =
        node.url ?? node.attributes?.find((attribute) => attribute.name === 'src')?.value;
      if (
        (node.type === 'image' || node.name === 'img') &&
        typeof source === 'string' &&
        /^(\/imgs\/|https:\/\/cdn\.jsdelivr\.net\/gh\/labring\/fastgpt-img@main\/)diagrams\/.+\.light\.svg$/.test(
          source
        )
      ) {
        const dark = source.replace(/\.light\.svg$/, '.dark.svg');
        if (node.type === 'image') {
          node.data ??= {};
          node.data.hProperties = { ...node.data.hProperties, 'data-dark-src': dark };
        } else {
          node.attributes.push({ type: 'mdxJsxAttribute', name: 'data-dark-src', value: dark });
        }
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}
