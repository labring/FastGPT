export type putUpdateGateConfigData = {
  status?: boolean;
  tools?: GateTool[];
  slogan?: string;
  placeholderText?: string;
};

export type putUpdateGateConfigResponse = {
  status?: boolean;
  tools?: string[];
  slogan?: string;
  placeholderText?: string;
};

export type putUpdateGateConfigCopyRightData = {
  name?: string;
  logo?: string;
  banner?: string;
};

export type putUpdateGateConfigCopyRightResponse = {
  name: string;
  logo: string;
  banner: string;
};

export type getGateConfigCopyRightResponse = {
  name: string;
  logo: string;
  banner: string;
};
