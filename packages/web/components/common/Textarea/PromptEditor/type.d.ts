import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

export type EditorVariablePickerType = {
  key: string;
  label: string;
  required?: boolean;
  icon?: string;
  valueType?: WorkflowIOValueTypeEnum;
  valueDesc?: string;
};

export type EditorVariableLabelPickerType = {
  key: string;
  label: string;
  required?: boolean;
  icon?: string;
  valueType?: WorkflowIOValueTypeEnum;
  parent: {
    id: string;
    label: string;
    avatar?: string;
  };
};

export type FormPropsType = Omit<BoxProps, 'onChange' | 'onBlur'>;

// 编辑器中工具添加的数据类型
export type EditorToolAddData = {
  toolKey: string; // 原始工具key
  toolName: string; // 工具名称
  toolAvatar: string; // 工具头像
  parentKey?: string; // 父级工具key（仅三级菜单有）
  subItemKey?: string; // 子项key（仅三级菜单有）
  subItemLabel?: string; // 子项名称（仅三级菜单有）
};

// 工具添加回调函数类型
export type OnAddToolFromEditor = (toolData: EditorToolAddData) => string;

// Lexical editor node types
export type BaseEditorNode = {
  type: string;
  version: number;
};

export type TextEditorNode = BaseEditorNode & {
  type: 'text';
  text: string;
  detail: number;
  format: number;
  mode: string;
  style: string;
};

export type LineBreakEditorNode = BaseEditorNode & {
  type: 'linebreak';
};

export type VariableLabelEditorNode = BaseEditorNode & {
  type: 'variableLabel';
  variableKey: string;
};

export type VariableEditorNode = BaseEditorNode & {
  type: 'Variable';
  variableKey: string;
};

export type TabEditorNode = BaseEditorNode & {
  type: 'tab';
};

export type SkillEditorNode = BaseEditorNode & {
  type: 'skill';
  skillKey: string;
  skillName?: string;
  skillAvatar?: string;
  format: number;
};

export type ChildEditorNode =
  | TextEditorNode
  | LineBreakEditorNode
  | VariableLabelEditorNode
  | VariableEditorNode
  | TabEditorNode
  | SkillEditorNode;

export type ParagraphEditorNode = BaseEditorNode & {
  type: 'paragraph';
  children: ChildEditorNode[];
  direction: string;
  format: string;
  indent: number;
};

export type ListItemEditorNode = BaseEditorNode & {
  type: 'listitem';
  children: Array<ChildEditorNode | ListEditorNode>;
  direction: string | null;
  format: string;
  indent: number;
  value: number;
};

export type ListEditorNode = BaseEditorNode & {
  type: 'list';
  children: ListItemEditorNode[];
  direction: string | null;
  format: string;
  indent: number;
  listType: 'bullet' | 'number';
  start: number;
  tag: 'ul' | 'ol';
};

export type EditorState = {
  root: {
    type: 'root';
    children: Array<ParagraphEditorNode | ListEditorNode>;
    direction: string;
    format: string;
    indent: number;
  } & BaseEditorNode;
};

export type ListItemInfo = {
  type: 'bullet' | 'number';
  text: string;
  indent: number;
  numberValue?: number;
};
