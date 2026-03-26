/** 执行请求参数 */
export type ExecuteOptions = {
  code: string;
  variables: Record<string, any>;
};

/** 执行结果 */
export type ExecuteResult = {
  success: boolean;
  data?: {
    codeReturn: any;
    log: string;
  };
  message?: string;
};
