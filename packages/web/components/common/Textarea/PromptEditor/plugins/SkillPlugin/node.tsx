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

export type SerializedSkillNode = Spread<
  {
    skillKey: string;
    skillName?: string;
    skillAvatar?: string;
    format: number | TextFormatType;
  },
  SerializedLexicalNode
>;

export class SkillNode extends DecoratorNode<JSX.Element> {
  __format: number | TextFormatType;
  __skillKey: string;
  __skillName?: string;
  __skillAvatar?: string;

  static getType(): string {
    return 'skill';
  }

  static clone(node: SkillNode): SkillNode {
    return new SkillNode(
      node.__skillKey,
      node.__skillName,
      node.__skillAvatar,
      node.__format,
      node.__key
    );
  }

  constructor(
    skillKey: string,
    skillName?: string,
    skillAvatar?: string,
    format?: number | TextFormatType,
    key?: NodeKey
  ) {
    super(key);
    this.__skillKey = skillKey;
    this.__skillName = skillName;
    this.__skillAvatar = skillAvatar;
    this.__format = format || 0;
  }

  static importJSON(serializedNode: SerializedSkillNode): SkillNode {
    const node = $createSkillNode(
      serializedNode.skillKey,
      serializedNode.skillName,
      serializedNode.skillAvatar
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

  exportJSON(): SerializedSkillNode {
    return {
      format: this.__format || 0,
      type: 'skill',
      version: 1,
      skillKey: this.getSkillKey(),
      skillName: this.__skillName,
      skillAvatar: this.__skillAvatar
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

  getSkillKey(): string {
    return this.__skillKey;
  }

  getTextContent(
    _includeInert?: boolean | undefined,
    _includeDirectionless?: false | undefined
  ): string {
    return `{{@${this.__skillKey}@}}`;
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    return (
      <SkillLabel
        skillKey={this.__skillKey}
        skillName={this.__skillName}
        skillAvatar={this.__skillAvatar}
      />
    );
  }
}

export function $createSkillNode(
  skillKey: string,
  skillName?: string,
  skillAvatar?: string
): SkillNode {
  return new SkillNode(skillKey, skillName, skillAvatar);
}

export function $isSkillNode(node: SkillNode | LexicalNode | null | undefined): node is SkillNode {
  return node instanceof SkillNode;
}
