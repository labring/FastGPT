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
import SkillLabel from './components/SkillLabel';
import type { SkillLabelItemType } from '.';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export type SkillLabelNodeBasicType = {
  id: string;
  name: string;
  icon?: string;
  skillType: FlowNodeTypeEnum;
  status: SkillLabelItemType['configStatus'];
  onClick: (id: string) => void;
};
export type SerializedSkillNode = Spread<
  {
    id: string;
    name: string;
    icon?: string;
    skillType: FlowNodeTypeEnum;
    format: number | TextFormatType;
  },
  SerializedLexicalNode
>;

export class SkillNode extends DecoratorNode<JSX.Element> {
  __format: number | TextFormatType = 0;
  __id: string;
  __name: string;
  __icon?: string;
  __skillType: FlowNodeTypeEnum;
  __status: SkillLabelItemType['configStatus'];
  __onClick: (id: string) => void;

  constructor({ id, name, icon, skillType, status, onClick }: SkillLabelNodeBasicType) {
    super();
    this.__id = id;
    this.__name = name;
    this.__icon = icon;
    this.__skillType = skillType;
    this.__status = status;
    this.__onClick = onClick;
  }

  static getType(): string {
    return 'skill';
  }

  static clone(node: SkillNode): SkillNode {
    const newNode = new SkillNode({
      id: node.__id,
      name: node.__name,
      icon: node.__icon,
      skillType: node.__skillType,
      status: node.__status,
      onClick: node.__onClick
    });
    return newNode;
  }

  static importJSON(serializedNode: SerializedSkillNode): SkillNode {
    const node = $createSkillNode({
      id: serializedNode.id,
      name: serializedNode.name,
      icon: serializedNode.icon,
      skillType: serializedNode.skillType,
      status: 'unconfigured',
      onClick: () => {}
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

  exportJSON(): SerializedSkillNode {
    return {
      version: 1,
      format: this.__format || 0,
      id: this.__id,
      name: this.__name,
      icon: this.__icon,
      skillType: this.__skillType,
      type: 'skill'
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

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  getSkillKey(): string {
    return this.__id;
  }

  getTextContent(
    _includeInert?: boolean | undefined,
    _includeDirectionless?: false | undefined
  ): string {
    return `{{@${this.__id}@}}`;
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    return (
      <SkillLabel
        id={this.__id}
        name={this.__name}
        icon={this.__icon}
        skillType={this.__skillType}
        status={this.__status}
        onClick={this.__onClick}
      />
    );
  }
}

export function $createSkillNode(e: SkillLabelNodeBasicType): SkillNode {
  return new SkillNode(e);
}

export function $isSkillNode(node: SkillNode | LexicalNode | null | undefined): node is SkillNode {
  return node instanceof SkillNode;
}
