import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
  type TextFormatType
} from 'lexical';
import VariableLabel from './components/VariableLabel';
import type { WorkflowReferenceStatus } from '@fastgpt/global/core/workflow/editor/types';
import { createElement } from 'react';

type VariableLabelInvalidReason = Exclude<WorkflowReferenceStatus['code'], 'empty' | 'valid'>;

type VariableLabelNodeOptions = {
  variableKey: string;
  variableLabel: string;
  nodeAvatar: string;
  invalidReason?: VariableLabelInvalidReason;
};

export type SerializedVariableLabelNode = Spread<
  {
    variableKey: string;
    variableLabel: string;
    nodeAvatar: string;
    invalidReason?: VariableLabelInvalidReason;
    format: number | TextFormatType;
  },
  SerializedLexicalNode
>;

export class VariableLabelNode extends DecoratorNode<JSX.Element> {
  __format: number | TextFormatType;
  __variableKey: string;
  __variableLabel: string;
  __nodeAvatar: string;
  __invalidReason?: VariableLabelInvalidReason;
  static getType(): string {
    return 'variableLabel';
  }
  static clone(node: VariableLabelNode): VariableLabelNode {
    return new VariableLabelNode({
      variableKey: node.__variableKey,
      variableLabel: node.__variableLabel,
      nodeAvatar: node.__nodeAvatar,
      format: node.__format,
      key: node.__key,
      invalidReason: node.__invalidReason
    });
  }
  constructor({
    variableKey,
    variableLabel,
    nodeAvatar,
    format,
    key,
    invalidReason
  }: VariableLabelNodeOptions & { format?: number | TextFormatType; key?: NodeKey }) {
    super(key);
    this.__variableKey = variableKey;
    this.__format = format || 0;
    this.__variableLabel = variableLabel;
    this.__nodeAvatar = nodeAvatar;
    this.__invalidReason = invalidReason;
  }

  static importJSON(serializedNode: SerializedVariableLabelNode): VariableLabelNode {
    const node = $createVariableLabelNode({
      variableKey: serializedNode.variableKey,
      variableLabel: serializedNode.variableLabel,
      nodeAvatar: serializedNode.nodeAvatar,
      invalidReason: serializedNode.invalidReason
    });
    node.setFormat(serializedNode.format);
    return node;
  }

  setFormat(format: number | TextFormatType): void {
    const self = this.getWritable();
    self.__format = format;
  }
  getFormat(): number | TextFormatType {
    return this.__format;
  }

  exportJSON(): SerializedVariableLabelNode {
    return {
      format: this.__format || 0,
      type: 'variableLabel',
      version: 1,
      variableKey: this.getVariableKey(),
      variableLabel: this.__variableLabel,
      nodeAvatar: this.__nodeAvatar,
      ...(this.__invalidReason ? { invalidReason: this.__invalidReason } : {})
    };
  }
  createDOM(): HTMLElement {
    const element = document.createElement('span');
    return element;
  }
  exportDOM(): DOMExportOutput {
    const element = document.createElement('span');
    element.textContent = this.getTextContent();
    return { element };
  }
  static importDOM(): DOMConversionMap | null {
    return {};
  }
  updateDOM(): false {
    return false;
  }
  isKeyboardSelectable(): boolean {
    return false;
  }
  getVariableKey(): string {
    return this.__variableKey;
  }
  getTextContent(
    _includeInert?: boolean | undefined,
    _includeDirectionless?: false | undefined
  ): string {
    return `${this.__variableKey}`;
  }
  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return createElement(VariableLabel, {
      variableKey: this.__variableKey,
      variableLabel: this.__variableLabel,
      nodeAvatar: this.__nodeAvatar,
      invalidReason: this.__invalidReason
    });
  }
}

export function $createVariableLabelNode(options: VariableLabelNodeOptions): VariableLabelNode {
  return new VariableLabelNode(options);
}

export function $isVariableLabelNode(
  node: VariableLabelNode | LexicalNode | null | undefined
): node is VariableLabelNode {
  return node instanceof VariableLabelNode;
}
