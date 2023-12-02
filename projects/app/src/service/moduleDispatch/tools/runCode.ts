import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import ivm from 'isolated-vm';
export type RunCodeProps = ModuleDispatchProps<{
  inputData: any;
  code: string;
}>;
export type RunCodeResponse = {
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType;
  [ModuleOutputKeyEnum.failed]?: boolean;
  [ModuleOutputKeyEnum.success]?: boolean;
  [ModuleOutputKeyEnum.answerText]: string;
};

type ExecuteResult = {
  result: string | undefined;
  error: string | undefined;
};

const executeClientCode = async (clientCode: string, inputData: any): Promise<ExecuteResult> => {
  const isolate = new ivm.Isolate({ memoryLimit: 128 });
  const context = await isolate.createContext();
  const jail = context.global;

  // 将本地数据传递到隔离环境
  await jail.set('inputData', new ivm.ExternalCopy(inputData).copyInto());

  // 准备要执行的脚本
  const scriptCode = `
  error = "";
  try {
    ${clientCode}
  } catch (e) {
    error = e.stack || e.toString();
  }
  `;
  const script = await isolate.compileScript(scriptCode);

  try {
    await script.run(context);

    const result = await jail.get('result');
    const error = await jail.get('error');

    return {
      result: result,
      error: error
    };

  } catch (e: any) {
    console.error('代码执行错误:', e);
    return {
      result: undefined,
      error: e
    };
  } finally {
    await context.release();
    await isolate.dispose();
  }
};

export const dispatchRunCode = async (props: Record<string, any>): Promise<RunCodeResponse> => {
  const {
    inputs: { code = '', inputData = null }
  } = props as RunCodeProps;

  const result = await executeClientCode(code, inputData);
  const failed = result.error == null;

  return {
    responseData: {
      price: 0,
      inputData: inputData,
      codeResult: result.result,
      errorMsg: result.error
    },
    [ModuleOutputKeyEnum.failed]: failed,
    [ModuleOutputKeyEnum.success]: !failed,
    [ModuleOutputKeyEnum.answerText]: result.result == undefined ? inputData : result.result
  };
};
