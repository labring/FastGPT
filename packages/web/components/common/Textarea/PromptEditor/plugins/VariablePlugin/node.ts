import type { NodeKey, EditorConfig, LexicalNode, SerializedTextNode } from 'lexical';

import { TextNode, $applyNodeReplacement } from 'lexical';
import { addClassNamesToElement } from '@lexical/utils';
import styles from '../../index.module.scss';

export class VariableNode extends TextNode {
  static getType(): string {
    return 'variable';
  }

  static clone(node: VariableNode): VariableNode {
    return new VariableNode(node.__text, node.__key);
  }

  constructor(text: string, key?: NodeKey) {
    super(text, key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    addClassNamesToElement(element, styles.variable);
    return element;
  }

  static importJSON(serializedNode: SerializedTextNode): TextNode {
    const node = $createVariableNode(serializedNode.text);
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);
    return node;
  }

  exportJSON(): SerializedTextNode {
    return {
      ...super.exportJSON(),
      type: 'variable'
    };
  }
}

export function $createVariableNode(text: string): VariableNode {
  return $applyNodeReplacement(new VariableNode(text));
}

export function $isVariableNode(node: LexicalNode | null | undefined): node is VariableNode {
  return node instanceof VariableNode;
}
