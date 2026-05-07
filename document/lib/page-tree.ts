import { type PageTree } from 'fumadocs-core/server';

const VIRTUAL_SECTION_ID_SUFFIX = '#virtual-section';

const isSeparator = (node: PageTree.Node): node is PageTree.Separator => node.type === 'separator';

const groupSeparatorSections = (nodes: PageTree.Node[]): PageTree.Node[] => {
  const grouped: PageTree.Node[] = [];
  let currentSection: PageTree.Folder | null = null;

  for (const node of nodes) {
    if (isSeparator(node) && node.name) {
      currentSection = {
        $id: `${node.$id ?? `section-${grouped.length}`}${VIRTUAL_SECTION_ID_SUFFIX}`,
        type: 'folder',
        name: node.name,
        icon: node.icon,
        children: []
      };
      grouped.push(currentSection);
      continue;
    }

    const nextNode =
      node.type === 'folder'
        ? {
            ...node,
            children: groupSeparatorSections(node.children)
          }
        : node;

    if (currentSection) {
      currentSection.children.push(nextNode);
    } else {
      grouped.push(nextNode);
    }
  }

  return grouped;
};

export const normalizePageTreeSections = (tree: PageTree.Root): PageTree.Root => ({
  ...tree,
  children: groupSeparatorSections(tree.children)
});
