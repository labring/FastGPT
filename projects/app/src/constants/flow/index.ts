import type { BoxProps } from '@chakra-ui/react';

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
  switch = 'switch',
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
  classifyQuestion = 'classifyQuestion',
  contentExtract = 'contentExtract',
  httpRequest = 'httpRequest'
}

export enum SpecialInputKeyEnum {
  'answerText' = 'text',
  'agents' = 'agents' // cq agent key
}

export enum FlowValueTypeEnum {
  'string' = 'string',
  'number' = 'number',
  'boolean' = 'boolean',
  'chatHistory' = 'chat_history',
  'kbQuote' = 'kb_quote',
  'any' = 'any'
}

export const FlowValueTypeStyle: Record<`${FlowValueTypeEnum}`, BoxProps> = {
  [FlowValueTypeEnum.string]: {
    background: '#36ADEF'
  },
  [FlowValueTypeEnum.number]: {
    background: '#FB7C3C'
  },
  [FlowValueTypeEnum.boolean]: {
    background: '#E7D118'
  },
  [FlowValueTypeEnum.chatHistory]: {
    background: '#00A9A6'
  },
  [FlowValueTypeEnum.kbQuote]: {
    background: '#A558C9'
  },
  [FlowValueTypeEnum.any]: {
    background: '#9CA2A8'
  }
};

export const initModuleType: Record<string, boolean> = {
  [FlowModuleTypeEnum.historyNode]: true,
  [FlowModuleTypeEnum.questionInput]: true
};

export const edgeOptions = {
  style: {
    strokeWidth: 1.5,
    stroke: '#5A646Es'
  }
};
export const connectionLineStyle = { strokeWidth: 1.5, stroke: '#5A646Es' };
