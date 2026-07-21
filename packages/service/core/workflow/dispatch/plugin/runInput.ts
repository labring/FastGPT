import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { UserError } from '@fastgpt/global/common/error/utils';
import { normalizeChatFileStoreValues } from '../../../chat/fileStoreValue';
import { getWorkflowFileContext, getWorkflowFileRegistrar } from '../../utils/context';

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
  const fileInputKeys = new Set(
    node.inputs
      .filter((input) => input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect))
      .map((input) => input.key)
  );

  /*
    对 params 中文件类型数据进行处理
    * 插件单独运行时，这里会是文件对象数组
    * 插件调用时，这个参数可能已经被转换成 string[]

    TODO: 需要 filter max files
  */
  await Promise.all(
    Object.keys(params).map(async (key) => {
      const val = params[key];
      if (fileInputKeys.has(key) && Array.isArray(val)) {
        params[key] = await Promise.all(
          val.map(async (fileItem) => {
            const storeValue = normalizeChatFileStoreValues([fileItem])[0];
            if (!storeValue) throw new UserError('Invalid workflow plugin file');

            const existingRef = fileContext?.resolveInputFile(storeValue);
            if (existingRef) return existingRef.modelUrl;
            if (!fileRegistrar) throw new UserError('Workflow file context is unavailable');

            const ref = await fileRegistrar.registerInputFile({
              file: storeValue,
              source: 'plugin'
            });
            if (!ref) throw new UserError('Invalid workflow plugin file');
            return ref.modelUrl;
          })
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
