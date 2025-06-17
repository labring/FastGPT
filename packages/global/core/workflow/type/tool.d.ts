export type ToolType = {
  isToolSet: boolean;
  type: string;
  toolId: string;
  isFolder?: boolean;
  parentId?: string;
  name: {
    'zh-CN': string;
    'zh-Hant'?: string;
    en?: string | undefined;
  };
  versionList: {
    version: string;
    description?: string | undefined;
  }[];
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
  cb?: (e: any) => Promise<any>;
};

export type ToolSetType = Omit<ToolType, 'cb' | 'isToolSet'> & {
  isToolSet: true;
  children: Array<ToolType>;
};
