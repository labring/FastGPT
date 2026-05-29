export const ApiKeyTagMap = {
  appLog: 'apiKey:appLog',

  chatHistory: 'apiKey:chatHistory',
  chatSession: 'apiKey:chatSession',
  chat: 'apiKey:chat',

  dataset: 'apiKey:dataset',
  datasetCollection: 'apiKey:datasetCollection',
  datasetCollectionCreate: 'apiKey:datasetCollectionCreate',
  datasetData: 'apiKey:datasetData',
  datasetDataIndex: 'apiKey:datasetDataIndex',
  datasetOther: 'apiKey:datasetOther'
};

export const ApiKeyTagNameMap: Record<string, string> = {
  [ApiKeyTagMap.appLog]: '应用日志',

  [ApiKeyTagMap.chatHistory]: '历史记录管理',
  [ApiKeyTagMap.chatSession]: '会话管理',
  [ApiKeyTagMap.chat]: '对话管理',

  [ApiKeyTagMap.dataset]: '知识库管理',
  [ApiKeyTagMap.datasetCollection]: '集合管理',
  [ApiKeyTagMap.datasetCollectionCreate]: '集合创建',
  [ApiKeyTagMap.datasetData]: '数据管理',
  [ApiKeyTagMap.datasetDataIndex]: '索引管理',
  [ApiKeyTagMap.datasetOther]: '其他'
};

export const apiKeyTagGroups = [
  {
    name: '应用管理',
    tags: [ApiKeyTagNameMap[ApiKeyTagMap.appLog]]
  },
  {
    name: '应用对话',
    tags: [
      ApiKeyTagNameMap[ApiKeyTagMap.chatHistory],
      ApiKeyTagNameMap[ApiKeyTagMap.chatSession],
      ApiKeyTagNameMap[ApiKeyTagMap.chat]
    ]
  },
  {
    name: '知识库',
    tags: [
      ApiKeyTagNameMap[ApiKeyTagMap.dataset],
      ApiKeyTagNameMap[ApiKeyTagMap.datasetCollection],
      ApiKeyTagNameMap[ApiKeyTagMap.datasetCollectionCreate],
      ApiKeyTagNameMap[ApiKeyTagMap.datasetData],
      ApiKeyTagNameMap[ApiKeyTagMap.datasetDataIndex],
      ApiKeyTagNameMap[ApiKeyTagMap.datasetOther]
    ]
  }
];
