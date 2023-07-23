export enum FlowInputItemTypeEnum {
  systemInput = 'systemInput', // history, userChatInput, variableInput
  input = 'input',
  textarea = 'textarea',
  numberInput = 'numberInput',
  select = 'select',
  slider = 'slider',
  custom = 'custom',
  target = 'target',
  none = 'none',
  hidden = 'hidden'
}

export enum FlowOutputItemTypeEnum {
  answer = 'answer',
  source = 'source',
  none = 'none',
  hidden = 'hidden'
}

export enum FlowModuleTypeEnum {
  empty = 'empty',
  variable = 'variable',
  userGuide = 'userGuide',
  questionInput = 'questionInput',
  historyNode = 'historyNode',
  chatNode = 'chatNode',
  kbSearchNode = 'kbSearchNode',
  tfSwitchNode = 'tfSwitchNode',
  answerNode = 'answerNode',
  classifyQuestion = 'classifyQuestion'
}

export const initModuleType: Record<string, boolean> = {
  [FlowModuleTypeEnum.historyNode]: true,
  [FlowModuleTypeEnum.questionInput]: true
};

export const edgeOptions = {
  style: {
    strokeWidth: 1,
    stroke: '#5A646Es'
  }
};
export const connectionLineStyle = { strokeWidth: 1, stroke: '#5A646Es' };
