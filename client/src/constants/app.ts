/* app */
export enum AppModuleItemTypeEnum {
  'variable' = 'variable',
  'userGuide' = 'userGuide',
  'initInput' = 'initInput',
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
