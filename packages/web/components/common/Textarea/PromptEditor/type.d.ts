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
export type TabEditorNode = BaseEditorNode & {
  type: 'tab';
};

// Rich text
export type ParagraphEditorNode = BaseEditorNode & {
  type: 'paragraph';
  children: ChildEditorNode[];
  direction: string;
  format: string;
  indent: number;
};

// ListItem 节点的 children 可以包含嵌套的 list 节点
export type ListItemChildEditorNode =
  | TextEditorNode
  | LineBreakEditorNode
  | TabEditorNode
  | VariableLabelEditorNode
  | VariableEditorNode;

export type ListItemEditorNode = BaseEditorNode & {
  type: 'listitem';
  children: (ListItemChildEditorNode | ListEditorNode)[];
  direction: string | null;
  format: string;
  indent: number;
  value: number;
};

// Custom variable node types
export type VariableLabelEditorNode = BaseEditorNode & {
  type: 'variableLabel';
  variableKey: string;
};
export type VariableEditorNode = BaseEditorNode & {
  type: 'Variable';
  variableKey: string;
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

export type ChildEditorNode =
  | TextEditorNode
  | LineBreakEditorNode
  | TabEditorNode
  | ParagraphEditorNode
  | ListEditorNode
  | ListItemEditorNode
  | VariableLabelEditorNode
  | VariableEditorNode;

export type EditorState = {
  root: {
    type: 'root';
    children: ChildEditorNode[];
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
