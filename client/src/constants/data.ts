export enum ChatModelEnum {
  'GPT35' = 'gpt-3.5-turbo',
  'GPT3516k' = 'gpt-3.5-turbo-16k',
  'GPT4' = 'gpt-4',
  'GPT432k' = 'gpt-4-32k'
}

export const chatModelList = [
  { label: 'Gpt35-16k', value: ChatModelEnum.GPT3516k },
  { label: 'Gpt35-4k', value: ChatModelEnum.GPT35 },
  { label: 'Gpt4-8k', value: ChatModelEnum.GPT4 }
];
