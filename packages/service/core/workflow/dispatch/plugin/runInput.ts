import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

export type PluginInputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;
export type PluginInputResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.userFiles]?: string[];
  [key: string]: any;
}>;

export const dispatchPluginInput = async (
  props: PluginInputProps
): Promise<PluginInputResponse> => {
  const { params, query } = props;
  const { files } = chatValue2RuntimePrompt(query);

  /* 
    对 params 中文件类型数据进行处理
    * 插件单独运行时，这里会是一个特殊的数组
    * 插件调用的话，这个参数是一个 string[] 不会进行处理
    * 硬性要求：API 单独调用插件时，要避免这种特殊类型冲突
    
    TODO: 需要 filter max files
  */
  for (const key in params) {
    const val = params[key];
    if (
      Array.isArray(val) &&
      val.every(
        (item) => item.type === ChatFileTypeEnum.file || item.type === ChatFileTypeEnum.image
      )
    ) {
      params[key] = val.map((item) => item.url);
    }
  }

  return {
    data: {
      ...params,
      [NodeOutputKeyEnum.userFiles]: files
        .map((item) => {
          return item?.url ?? '';
        })
        .filter(Boolean)
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {}
  };
};
