export interface RedisModelDataItemType {
  id: string;
  value: {
    vector: number[];
    q: string; // 提问词
    a: string; // 原文
    modelId: string;
    userId: string;
  };
}
