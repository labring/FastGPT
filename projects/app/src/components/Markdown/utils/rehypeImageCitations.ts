type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

export const imageCitationParagraphClassName = 'image-citation-paragraph';

const isWhitespaceText = (node: HastNode) => node.type === 'text' && !node.value?.trim();

const isCitationLink = (node: HastNode) => {
  if (node.type !== 'element' || node.tagName !== 'a') return false;

  const href = node.properties?.href;
  return typeof href === 'string' && (href.startsWith('CITE') || href.startsWith('QUOTE'));
};

/**
 * 标记“图片后仅包含引用”的 Markdown 段落，供样式层居中图片直属引用。
 * 空白和 remark-breaks 生成的换行节点不影响识别；存在普通正文时保持原有行内引用布局。
 */
export const rehypeImageCitations = () => (tree: HastNode) => {
  const visit = (node: HastNode) => {
    if (node.type === 'element' && node.tagName === 'p' && node.children) {
      const meaningfulChildren = node.children.filter((child) => !isWhitespaceText(child));
      const [firstChild, ...remainingChildren] = meaningfulChildren;
      const hasLeadingImage = firstChild?.type === 'element' && firstChild.tagName === 'img';
      const citationLinks = remainingChildren.filter(isCitationLink);
      const onlyContainsImageCitations = remainingChildren.every(
        (child) => isCitationLink(child) || (child.type === 'element' && child.tagName === 'br')
      );

      if (hasLeadingImage && citationLinks.length > 0 && onlyContainsImageCitations) {
        const className = node.properties?.className;
        const classNames = Array.isArray(className)
          ? className
          : typeof className === 'string'
            ? className.split(' ')
            : [];

        node.properties = {
          ...node.properties,
          className: [...classNames, imageCitationParagraphClassName]
        };
      }
    }

    node.children?.forEach(visit);
  };

  visit(tree);
};
