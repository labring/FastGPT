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
import Variable from './components/Variable';

export type SerializedVariableNode = Spread<
  {
    variableKey: string;
    variableLabel: string;
    format: number | TextFormatType;
  },
  SerializedLexicalNode
>;

export class VariableNode extends DecoratorNode<JSX.Element> {
  __format: number | TextFormatType;
  __variableKey: string;
  __variableLabel: string;
  static getType(): string {
    return 'Variable';
  }
  static clone(node: VariableNode): VariableNode {
    return new VariableNode(node.__variableKey, node.__variableLabel, node.__format, node.__key);
  }
  constructor(
    variableKey: string,
    variableLabel: string,
    format?: number | TextFormatType,
    key?: NodeKey
  ) {
    super(key);
    this.__variableKey = variableKey;
    this.__format = format || 0;
    this.__variableLabel = variableLabel;
  }

  static importJSON(serializedNode: SerializedVariableNode): VariableNode {
    const node = $createVariableNode(serializedNode.variableKey, serializedNode.variableLabel);
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

  exportJSON(): SerializedVariableNode {
    return {
      format: this.__format || 0,
      type: 'Variable',
      version: 1,
      variableKey: this.getVariableKey(),
      variableLabel: this.__variableLabel
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
  getTextContent(
    _includeInert?: boolean | undefined,
    _includeDirectionless?: false | undefined
  ): string {
    return `${this.__variableKey}`;
  }
  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    return <Variable variableLabel={this.__variableLabel} />;
  }
}

export function $createVariableNode(variableKey: string, variableLabel: string): VariableNode {
  return new VariableNode(variableKey, variableLabel);
}

export function $isVariableNode(
  node: VariableNode | LexicalNode | null | undefined
): node is VariableNode {
  return node instanceof VariableNode;
}
