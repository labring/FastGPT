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
  userGuide = 'userGuide',
  questionInputNode = 'questionInput',
  historyNode = 'historyNode',
  chatNode = 'chatNode',
  kbSearchNode = 'kbSearchNode',
  tfSwitchNode = 'tfSwitchNode',
  answerNode = 'answerNode',
  recognizeIntention = 'recognizeIntention'
}

export const edgeOptions = {
  style: {
    strokeWidth: 1,
    stroke: '#5A646Es'
  }
};
export const connectionLineStyle = { strokeWidth: 1, stroke: '#5A646Es' };
