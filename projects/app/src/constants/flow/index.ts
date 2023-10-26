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
  answerNode = 'answerNode',
  classifyQuestion = 'classifyQuestion',
  contentExtract = 'contentExtract',
  httpRequest = 'httpRequest',
  runApp = 'app',
  customModule = 'customModel',
  customInput = 'customInput',
  customIOutput = 'customIOutput'
}

export enum SpecialInputKeyEnum {
  'answerText' = 'text',
  'agents' = 'agents' // cq agent key
}

export enum FlowValueTypeEnum {
  'string' = 'string',
  'number' = 'number',
  'boolean' = 'boolean',
  'chatHistory' = 'chatHistory',
  'datasetQuote' = 'datasetQuote',
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
  [FlowValueTypeEnum.datasetQuote]: {
    background: '#A558C9'
  },
  [FlowValueTypeEnum.any]: {
    background: '#9CA2A8'
  }
};
export const FlowValueTypeTip = {
  [FlowValueTypeEnum.string]: {
    label: 'app.module.valueType.string',
    example: ''
  },
  [FlowValueTypeEnum.number]: {
    label: 'app.module.valueType.number',
    example: ''
  },
  [FlowValueTypeEnum.boolean]: {
    label: 'app.module.valueType.boolean',
    example: ''
  },
  [FlowValueTypeEnum.chatHistory]: {
    label: 'app.module.valueType.chatHistory',
    example: `{
  obj: System | Human | AI;
  value: string;
}`
  },
  [FlowValueTypeEnum.datasetQuote]: {
    label: 'app.module.valueType.datasetQuote',
    example: `{
  id: string;
  datasetId: string;
  collectionId: string;
  sourceName: string;
  sourceId?: string;
  q: string;
  a: string
}`
  },
  [FlowValueTypeEnum.any]: {
    label: 'app.module.valueType.any',
    example: ''
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
