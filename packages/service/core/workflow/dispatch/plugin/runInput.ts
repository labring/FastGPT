import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { getS3ChatSource } from '../../../../common/s3/sources/chat';

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
      // 为文件对象重新签发 URL（如果有 key 但没有 url）
      for (let i = 0; i < val.length; i++) {
        const fileItem = val[i];
        if (fileItem.key && !fileItem.url) {
          val[i].url = await getS3ChatSource().createGetChatFileURL({
            key: fileItem.key,
            external: true,
            expiredHours: 1
          });
        }
      }
      params[key] = val.map((item) => item.url);
    }
  }

  return {
    data: {
      ...params,

      // 旧版本适配
      [NodeOutputKeyEnum.userFiles]: files
        .map((item) => {
          return item?.url ?? '';
        })
        .filter(Boolean)
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {}
  };
};
