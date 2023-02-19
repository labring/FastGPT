import { ModelStatusEnum } from '@/constants/model';
export interface ModelType {
  _id: string;
  userId: string;
  name: string;
  avatar: string;
  status: `${ModelStatusEnum}`;
  updateTime: Date;
  trainingTimes: number;
  systemPrompt: string;
  service: {
    company: 'openai'; // 关联的厂商
    trainId: string; // 训练时需要的ID
    chatModel: string; // 聊天时用的模型
    modelName: string; // 关联的模型
  };
  security: {
    domain: string[];
    contentMaxLen: number;
    contextMaxLen: number;
    expiredTime: number;
    maxLoadAmount: number;
  };
}

export interface ModelUpdateParams {
  name: string;
  systemPrompt: string;
  service: {
    company: 'openai'; // 关联的厂商
    modelName: string; // 关联的模型
  };
  security: {
    domain: string[];
    contentMaxLen: number;
    contextMaxLen: number;
    expiredTime: number;
    maxLoadAmount: number;
  };
}
