import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import type {
  WorkflowFieldSnapshot,
  WorkflowReferenceStatus
} from '@fastgpt/global/core/workflow/editor/types';
import type { EditorVariableLabelPickerType } from '../../type';

type VariableLabelInvalidReason = Exclude<WorkflowReferenceStatus['code'], 'empty' | 'valid'>;

type VariableLabelData = {
  variableLabel: string;
  nodeAvatar: string;
  invalidReason?: VariableLabelInvalidReason;
};

/**
 * 提取变量标签的显示信息。
 * 来源仍有效时使用实时变量列表；来源已失效时使用引用状态里的快照名称，避免只显示“无效变量”。
 */
export const getVariableLabelData = ({
  variableKey,
  variables = [],
  references,
  t
}: {
  variableKey: string;
  variables?: readonly EditorVariableLabelPickerType[];
  references?: WorkflowFieldSnapshot['references'];
  t: (key: string) => string;
}): VariableLabelData => {
  const content = variableKey.slice(3, -3);
  const [parentKey, ...childKeys] = content.split('.');
  const childKey = childKeys.join('.') || content;
  const currentVariable = variables.find(
    (item) => item.parent.id === parentKey && item.key === childKey
  );
  const currentStatus = references?.find(
    (status) =>
      status.reference !== undefined &&
      status.reference[0] === parentKey &&
      status.reference[1] === childKey
  );
  const invalidReason =
    currentStatus && currentStatus.code !== 'empty' && currentStatus.code !== 'valid'
      ? currentStatus.code
      : undefined;

  if (currentVariable) {
    return {
      variableLabel: `${currentVariable.parent.label}.${currentVariable.label}`,
      nodeAvatar: currentVariable.parent.avatar ?? '',
      invalidReason
    };
  }

  if (!currentStatus) return { variableLabel: `undefined.${childKey}`, nodeAvatar: '' };

  // 只有全局变量分组是固定文案。快照中的节点名和自定义输出名保留原文。
  const sourceLabel =
    parentKey === VARIABLE_NODE_ID && currentStatus.sourceLabel
      ? t('common:core.module.Variable')
      : (currentStatus.sourceLabel ?? 'undefined');
  return {
    variableLabel: `${sourceLabel}.${currentStatus.outputLabel ?? childKey}`,
    nodeAvatar: currentStatus.icon ?? '',
    invalidReason
  };
};

function getHashtagRegexVariableLabels(): Readonly<{
  leftChars: string;
  rightChars: string;
  middleChars: string;
}> {
  const leftChars = '{';
  const rightChars = '}';
  const middleChars = '$';

  return {
    leftChars,
    rightChars,
    middleChars
  };
}

export function getHashtagRegexString(): string {
  const { leftChars, rightChars, middleChars } = getHashtagRegexVariableLabels();

  const hashLeftCharList = `[${leftChars}]`;
  const hashRightCharList = `[${rightChars}]`;
  const hashMiddleCharList = `[${middleChars}]`;

  // A hashtag contains characters, numbers and underscores,
  // but not all numbers.
  const hashtag =
    `(${hashLeftCharList})` +
    `(${hashLeftCharList})` +
    `(${hashMiddleCharList})(.*?)(${hashMiddleCharList})` +
    `(${hashRightCharList})(${hashRightCharList})`;

  return hashtag;
}
