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

export type putUploadGateLogoData = {
  teamId?: string;
  ratio: string; // "4:1" | "1:1"
  file: File;
};

export type deleteGateLogoData = {
  teamId?: string;
  logoId: string;
};
