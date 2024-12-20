import {
  DecoratorNode,
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
  TextFormatType
} from 'lexical';
import WorkflowVariable from './components/WorkflowVariable';

export type SerializedWorkflowVariableNode = Spread<
  {
    variableKey: string;
    variableLabel: string;
    format: number | TextFormatType;
  },
  SerializedLexicalNode
>;

export class WorkflowVariableNode extends DecoratorNode<JSX.Element> {
  __format: number | TextFormatType;
  __variableKey: string;
  __variableLabel: string;
  static getType(): string {
    return 'workflowVariable';
  }
  static clone(node: WorkflowVariableNode): WorkflowVariableNode {
    return new WorkflowVariableNode(
      node.__variableKey,
      node.__variableLabel,
      node.__format,
      node.__key
    );
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

  static importJSON(serializedNode: SerializedWorkflowVariableNode): WorkflowVariableNode {
    const node = $createWorkflowVariableNode(
      serializedNode.variableKey,
      serializedNode.variableLabel
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

  exportJSON(): SerializedWorkflowVariableNode {
    return {
      format: this.__format || 0,
      type: 'workflowVariable',
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
    return <WorkflowVariable variableLabel={this.__variableLabel} />;
  }
}

export function $createWorkflowVariableNode(
  variableKey: string,
  variableLabel: string
): WorkflowVariableNode {
  return new WorkflowVariableNode(variableKey, variableLabel);
}

export function $isWorkflowVariableNode(
  node: WorkflowVariableNode | LexicalNode | null | undefined
): node is WorkflowVariableNode {
  return node instanceof WorkflowVariableNode;
}
