import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { createChatFilePreviewUrlGetter } from '../../../../common/s3/sources/chat';

export type PluginInputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;
export type PluginInputResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.userFiles]?: string[];
  [key: string]: any;
}>;

type PluginFileItem = {
  type: ChatFileTypeEnum;
  key?: string;
  url?: string;
};

const isPluginFileItem = (item: unknown): item is PluginFileItem =>
  !!item &&
  typeof item === 'object' &&
  ((item as PluginFileItem).type === ChatFileTypeEnum.file ||
    (item as PluginFileItem).type === ChatFileTypeEnum.image);

export const dispatchPluginInput = async (
  props: PluginInputProps
): Promise<PluginInputResponse> => {
  const { params, query } = props;
  const { files } = chatValue2RuntimePrompt(query);
  const getPreviewUrl = createChatFilePreviewUrlGetter({ expiredHours: 1 });

  /*
    对 params 中文件类型数据进行处理
    * 插件单独运行时，这里会是一个特殊的数组
    * 插件调用的话，这个参数是一个 string[] 不会进行处理
    * 硬性要求：API 单独调用插件时，要避免这种特殊类型冲突

    TODO: 需要 filter max files
  */
  await Promise.all(
    Object.keys(params).map(async (key) => {
      const val = params[key];
      if (Array.isArray(val) && val.every(isPluginFileItem)) {
        // 为文件对象重新签发 URL（如果有 key 但没有 url）
        await Promise.all(
          val.map(async (fileItem) => {
            if (fileItem.key && !fileItem.url) {
              fileItem.url = await getPreviewUrl(fileItem.key);
            }
          })
        );
        params[key] = val.map((item) => item.url);
      }
    })
  );

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
