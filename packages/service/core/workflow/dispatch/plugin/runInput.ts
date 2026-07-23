import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  normalizeChatFileStoreValue,
  normalizeChatFileStoreValues
} from '../../../chat/fileStoreValue';
import { getWorkflowFileContext, getWorkflowFileRegistrar } from '../../utils/context';
import { getModuleFileAmountLimit } from '@fastgpt/global/core/workflow/fileLimit';

const DEFAULT_PLUGIN_FILE_INPUT_MAX_FILES = 5;

export type PluginInputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;
export type PluginInputResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.userFiles]?: string[];
  [key: string]: any;
}>;

/** 将 Plugin Input 的 fileSelect 值登记到当前 Workflow 文件上下文并输出模型 URL。 */
export const dispatchPluginInput = async (
  props: PluginInputProps
): Promise<PluginInputResponse> => {
  const { params, query, node } = props;
  const { files } = chatValue2RuntimePrompt(query);
  const fileContext = getWorkflowFileContext();
  const fileRegistrar = getWorkflowFileRegistrar();
  const userMaxFileAmount =
    fileContext?.limits.maxFileAmount ?? DEFAULT_PLUGIN_FILE_INPUT_MAX_FILES;
  const fileInputMaxFiles = new Map(
    node.inputs
      .filter((input) => input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect))
      .map(
        (input) =>
          [
            input.key,
            getModuleFileAmountLimit({
              userMaxFileAmount,
              moduleMaxFileAmount: input.maxFiles,
              defaultModuleMaxFileAmount: DEFAULT_PLUGIN_FILE_INPUT_MAX_FILES
            })
          ] as const
      )
  );

  /*
    对 params 中文件类型数据进行处理
    * 插件单独运行时，这里会是文件对象数组
    * 插件调用时，这个参数可能已经被转换成 string[]
  */
  await Promise.all(
    Object.keys(params).map(async (key) => {
      const val = params[key];
      const maxFiles = fileInputMaxFiles.get(key);
      if (maxFiles !== undefined && Array.isArray(val)) {
        const fileUrls = await Promise.all(
          val.slice(0, maxFiles).map(async (fileItem) => {
            const storeValue =
              typeof fileItem === 'string'
                ? normalizeChatFileStoreValue({ url: fileItem })
                : normalizeChatFileStoreValues([fileItem])[0];
            if (!storeValue) throw new UserError('Invalid workflow plugin file');

            const existingRef = fileContext?.resolveInputFile(storeValue);
            if (existingRef) return existingRef.modelUrl;
            if (!fileRegistrar) throw new UserError('Workflow file context is unavailable');

            const ref = await fileRegistrar.registerInputFile({
              file: storeValue,
              source: 'plugin'
            });
            return ref?.modelUrl;
          })
        );
        params[key] = fileUrls.filter(
          (url): url is string => typeof url === 'string' && Boolean(url)
        );
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
