import { GateTool } from './type';

export type putUpdateGateConfigData = {
  status?: boolean;
  tools?: GateTool[];
  slogan?: string;
  placeholderText?: string;
};

export type putUpdateGateConfigResponse = {
  status: boolean;
  tools: string[];
  slogan: string;
  placeholderText: string;
};

export type putUpdateGateConfigCopyRightData = {
  name?: string;
  avatar?: string;
};

export type putUpdateGateConfigCopyRightResponse = {
  name: string;
  avatar: string;
};

export type getGateConfigCopyRightResponse = {
  name: string;
  avatar: string;
};
