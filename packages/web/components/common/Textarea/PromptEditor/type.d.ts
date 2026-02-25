import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

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

export type ParagraphEditorNode = BaseEditorNode & {
  type: 'paragraph';
  children: ChildEditorNode[];
  direction: string;
  format: string;
  indent: number;
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

export type ListItemEditorNode = BaseEditorNode & {
  type: 'listitem';
  children: ChildEditorNode[];
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

export type SkillEditorNode = BaseEditorNode & {
  type: 'skill';
  id: string;
  name?: string;
  icon?: string;
  skillType?: `${FlowNodeTypeEnum}`;
  format: number;
};

export type ChildEditorNode =
  | TextEditorNode
  | LineBreakEditorNode
  | TabEditorNode
  | ParagraphEditorNode
  | ListEditorNode
  | ListItemEditorNode
  | VariableLabelEditorNode
  | VariableEditorNode
  | SkillEditorNode;

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
