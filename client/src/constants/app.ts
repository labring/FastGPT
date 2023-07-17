import type { AppItemType } from '@/types/app';
import { rawSearchKey } from './chat';

/* app */
export enum AppModuleItemTypeEnum {
  'userGuide' = 'userGuide', // default chat input: userChatInput, history
  'initInput' = 'initInput', // default chat input: userChatInput, history
  'http' = 'http', // send a http request
  'switch' = 'switch', // one input and two outputs
  'answer' = 'answer' // redirect response
}
export enum SystemInputEnum {
  'welcomeText' = 'welcomeText',
  'variables' = 'variables',
  'switch' = 'switch', // a trigger switch
  'history' = 'history',
  'userChatInput' = 'userChatInput'
}
export enum SpecificInputEnum {
  'answerText' = 'answerText' //  answer module text key
}
export enum VariableInputEnum {
  input = 'input',
  select = 'select'
}
