import type { BoxProps } from '@chakra-ui/react';

export enum FlowInputItemTypeEnum {
  systemInput = 'systemInput', // history, userChatInput, variableInput
  input = 'input', // one line input
  textarea = 'textarea',
  numberInput = 'numberInput',
  select = 'select',
  slider = 'slider',
  custom = 'custom',
  target = 'target', // data input
  switch = 'switch',
  chatInput = 'chatInput',
  selectApp = 'selectApp',
  // chat special input
  aiSettings = 'aiSettings',
  maxToken = 'maxToken',
  selectChatModel = 'selectChatModel',
  // dataset special input
  selectDataset = 'selectDataset',
  hidden = 'hidden'
}

export enum FlowOutputItemTypeEnum {
  answer = 'answer',
  source = 'source',
  hidden = 'hidden'
}

export enum FlowModuleTypeEnum {
  empty = 'empty',
  variable = 'variable',
  userGuide = 'userGuide',
  questionInput = 'questionInput',
  historyNode = 'historyNode',
  chatNode = 'chatNode',
  datasetSearchNode = 'datasetSearchNode',
  tfSwitchNode = 'tfSwitchNode',
  answerNode = 'answerNode',
  classifyQuestion = 'classifyQuestion',
  contentExtract = 'contentExtract',
  httpRequest = 'httpRequest',
  app = 'app'
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
