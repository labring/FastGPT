import { GateStatus, GateTool, GateHomeConfigType, GateCopyrightConfigType } from './type';

export type getGateConfigParams = {
  teamId?: string;
};

export type postCreateGateConfigData = {
  teamId: string;
  home?: Partial<GateHomeConfigType>;
  copyright?: Partial<GateCopyrightConfigType>;
};

export type putUpdateGateHomeConfigData = {
  teamId?: string;
  status?: GateStatus;
  tools?: GateTool[];
  slogan?: string;
  placeholderText?: string;
};

export type putUpdateGateCopyrightConfigData = {
  teamId?: string;
  teamName?: string;
};
