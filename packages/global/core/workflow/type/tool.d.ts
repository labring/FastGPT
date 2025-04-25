export type ToolType = {
  type: string;
  toolId: string;
  isFolder?: boolean;
  parentId?: string;
  name: {
    'zh-CN': string;
    'zh-Hant'?: string;
    en?: string | undefined;
  };
  version: string;
  versionList: string[];
  description: {
    'zh-CN': string;
    'zh-Hant'?: string;
    en?: string | undefined;
  };
  icon: string;
  author?: string | undefined;
  docURL?: string | undefined;

  workflow?: {
    nodes: Array<any>;
    edges: Array<any>;
  };
  inputs?: Array<any>;
  outputs?: Array<any>;
};
