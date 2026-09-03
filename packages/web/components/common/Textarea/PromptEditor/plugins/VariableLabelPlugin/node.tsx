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
import type { EditorVariableLabelPickerType } from '../../type';

type VariableLabelInvalidReason = EditorVariableLabelPickerType['invalidReason'];

export type SerializedVariableLabelNode = Spread<
  {
    variableKey: string;
    variableLabel: string;
    nodeAvatar: string;
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
    return new VariableLabelNode(
      node.__variableKey,
      node.__variableLabel,
      node.__nodeAvatar,
      node.__format,
      node.__key,
      node.__invalidReason
    );
  }
  constructor(
    variableKey: string,
    variableLabel: string,
    nodeAvatar: string,
    format?: number | TextFormatType,
    key?: NodeKey,
    invalidReason?: VariableLabelInvalidReason
  ) {
    super(key);
    this.__variableKey = variableKey;
    this.__format = format || 0;
    this.__variableLabel = variableLabel;
    this.__nodeAvatar = nodeAvatar;
    this.__invalidReason = invalidReason;
  }

  static importJSON(serializedNode: SerializedVariableLabelNode): VariableLabelNode {
    const node = $createVariableLabelNode(
      serializedNode.variableKey,
      serializedNode.variableLabel,
      serializedNode.nodeAvatar
    );
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
      nodeAvatar: this.__nodeAvatar
    };
  }
  createDOM(): HTMLElement {
    const element = document.createElement('span');
    return element;
  }
  exportDOM(): DOMExportOutput {
    const element = document.createElement('span');
    return { element };
  }
  static importDOM(): DOMConversionMap | null {
    return {};
  }
  updateDOM(): false {
    return false;
  }
  getVariableKey(): string {
    return this.__variableKey;
  }
  setVariableLabel(variableLabel: string): void {
    if (this.__variableLabel === variableLabel) return;
    this.getWritable().__variableLabel = variableLabel;
  }
  setNodeAvatar(nodeAvatar: string): void {
    if (this.__nodeAvatar === nodeAvatar) return;
    this.getWritable().__nodeAvatar = nodeAvatar;
  }
  setInvalidReason(invalidReason?: VariableLabelInvalidReason): void {
    if (this.__invalidReason === invalidReason) return;
    this.getWritable().__invalidReason = invalidReason;
  }
  getTextContent(
    _includeInert?: boolean | undefined,
    _includeDirectionless?: false | undefined
  ): string {
    return `${this.__variableKey}`;
  }
  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    return (
      <VariableLabel
        variableLabel={this.__variableLabel}
        nodeAvatar={this.__nodeAvatar}
        invalidReason={this.__invalidReason}
      />
    );
  }
}

export function $createVariableLabelNode(
  variableKey: string,
  variableLabel: string,
  nodeAvatar: string,
  invalidReason?: VariableLabelInvalidReason
): VariableLabelNode {
  return new VariableLabelNode(
    variableKey,
    variableLabel,
    nodeAvatar,
    undefined,
    undefined,
    invalidReason
  );
}

export function $isVariableLabelNode(
  node: VariableLabelNode | LexicalNode | null | undefined
): node is VariableLabelNode {
  return node instanceof VariableLabelNode;
}
