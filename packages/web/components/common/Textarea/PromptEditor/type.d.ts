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

export type VariableLabelEditorNode = BaseEditorNode & {
  type: 'variableLabel';
  variableKey: string;
};

export type VariableEditorNode = BaseEditorNode & {
  type: 'Variable';
  variableKey: string;
};

export type ChildEditorNode =
  | TextEditorNode
  | LineBreakEditorNode
  | VariableLabelEditorNode
  | VariableEditorNode;

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

export type RootEditorNode = BaseEditorNode & {
  type: 'root';
  children: Array<ParagraphEditorNode | ListEditorNode>;
  direction: string;
  format: string;
  indent: number;
};

export type EditorState = {
  root: RootEditorNode;
};

// For textToEditorState parsing
export type ParsedTextLine = {
  type: 'paragraph' | 'bullet' | 'number';
  text: string;
  indent: number;
  value?: number;
};

export type ListItemInfo = {
  type: 'bullet' | 'number';
  text: string;
  indent: number;
  value?: number;
};
