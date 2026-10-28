type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  children?: HastNode[];
};

/**
 * 在表格的代码和公式中恢复 htmlTable2Md 编码的管道符，保留已有 LaTeX 反斜杠。
 * 普通文本由 Markdown 解析器解码；代码和公式不解析实体，需在 KaTeX 之前补这一层。
 */
export const rehypeTablePipes = () => (tree: HastNode) => {
  // 只遍历当前表格上下文，避免改写表格外代码中的实体字面量。
  const visit = (node: HastNode, inTable = false) => {
    const isInTable = inTable || node.tagName === 'table';

    if (isInTable && node.tagName === 'code') {
      node.children?.forEach((child) => {
        if (child.type === 'text' && child.value) {
          child.value = child.value.replaceAll('&#124;', '|');
        }
      });
      return;
    }

    node.children?.forEach((child) => visit(child, isInTable));
  };

  visit(tree);
};
