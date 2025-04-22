export type GateStatus = 'enabled' | 'disabled';

export type GateTool = 'webSearch' | 'deepThinking' | 'fileUpload' | 'imageUpload' | 'voiceInput';

export type GateCopyrightLogoType = {
  id: string;
  ratio: string; // "4:1" | "1:1"
  url: string;
  updatedAt: Date;
};

export type GateHomeConfigType = {
  status: GateStatus;
  tools: GateTool[];
  slogan: string;
  placeholderText: string;
};

export type GateCopyrightConfigType = {
  teamName: string;
  logos: GateCopyrightLogoType[];
};

// 数据库Schema类型定义
export type GateSchemaType = {
  _id: string;
  teamId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  home: GateHomeConfigType;
  copyright: GateCopyrightConfigType;
};

export type GateConfigType = {
  _id?: string;
  teamId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  home: GateHomeConfigType;
  copyright: GateCopyrightConfigType;
};
