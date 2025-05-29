import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { splitCombinePluginId } from '../../../app/plugin/controller';
import { runTool } from '../../../app/tool/api';

type Props = ModuleDispatchProps<{}>;
type Response = DispatchNodeResultType<{}>;

export const dispatchSystemTool = async (props: Props): Promise<Response> => {
  const { pluginId } = await splitCombinePluginId(props.node.pluginId ?? '');
  const { output, error } = await runTool(pluginId, props.params);
  if (error) {
    return Promise.reject(new Error(error));
  }
  return output;
};
