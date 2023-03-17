export enum ChatModelNameEnum {
  GPT35 = 'gpt-3.5-turbo',
  GPT3 = 'text-davinci-003'
}
export const OpenAiList = [
  {
    name: 'chatGPT',
    model: ChatModelNameEnum.GPT35,
    trainName: 'turbo',
    canTraining: false,
    maxToken: 4060
  },
  {
    name: 'GPT3',
    model: ChatModelNameEnum.GPT3,
    trainName: 'davinci',
    canTraining: true,
    maxToken: 4060
  }
];

export enum TrainingStatusEnum {
  pending = 'pending',
  succeed = 'succeed',
  errored = 'errored',
  canceled = 'canceled'
}

export enum ModelStatusEnum {
  running = 'running',
  training = 'training',
  pending = 'pending',
  closed = 'closed'
}

export const formatModelStatus = {
  [ModelStatusEnum.running]: {
    colorTheme: 'green',
    text: '运行中'
  },
  [ModelStatusEnum.training]: {
    colorTheme: 'blue',
    text: '训练中'
  },
  [ModelStatusEnum.pending]: {
    colorTheme: 'gray',
    text: '加载中'
  },
  [ModelStatusEnum.closed]: {
    colorTheme: 'red',
    text: '已关闭'
  }
};
