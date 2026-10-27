import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getHandleId, nodeInputIsReference } from '@fastgpt/global/common/workflow/reference';
import type { UserSelectOptionItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { USER_SELECT_REFERENCE_HANDLE_KEY } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { resolveDynamicOptionStrings } from './dynamicOptions';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.description]: string;
  [NodeInputKeyEnum.userSelectOptions]: UserSelectOptionItemType[] | ReferenceValueType;
}>;
type UserSelectResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.selectResult]?: string;
}>;

export const dispatchUserSelect = async (props: Props): Promise<UserSelectResponse> => {
  const {
    histories,
    node,
    runtimeNodesMap,
    variableState,
    params: { description, userSelectOptions },
    query,
    lastInteractive
  } = props;
  const { nodeId, isEntry } = node;

  const userSelectOptionInput = node.inputs.find(
    (input) => input.key === NodeInputKeyEnum.userSelectOptions
  );
  const isReferenceMode = !!userSelectOptionInput && nodeInputIsReference(userSelectOptionInput);

  // Interactive node is not the entry node, return interactive result
  if (!isEntry || lastInteractive?.type !== 'userSelect') {
    const resolvedOptions: UserSelectOptionItemType[] = isReferenceMode
      ? resolveDynamicOptionStrings({
          value: userSelectOptions,
          runtimeNodesMap,
          variables: variableState?.toRuntimeRecord?.() ?? {}
        }).map((value, index) => ({
          key: `option_${index + 1}`,
          value
        }))
      : (userSelectOptions as UserSelectOptionItemType[]);

    if (isReferenceMode && resolvedOptions.length === 0) {
      throw new Error(i18nT('workflow:user_select_no_available_options'));
    }

    return {
      [DispatchNodeResponseKeyEnum.interactive]: {
        type: 'userSelect',
        params: {
          description,
          userSelectOptions: resolvedOptions
        }
      }
    };
  }

  node.isEntry = false;

  const { text: userSelectedVal } = chatValue2RuntimePrompt(query);
  const manualOptions = userSelectOptions as UserSelectOptionItemType[];

  // Error status
  if (userSelectedVal === undefined) {
    return {
      [DispatchNodeResponseKeyEnum.skipHandleId]: isReferenceMode
        ? [getHandleId(nodeId, 'source', USER_SELECT_REFERENCE_HANDLE_KEY)]
        : manualOptions.map((item) => getHandleId(nodeId, 'source', item.key))
    };
  }

  return {
    data: {
      [NodeOutputKeyEnum.selectResult]: userSelectedVal
    },
    [DispatchNodeResponseKeyEnum.rewriteHistories]: histories.slice(0, -2), // Removes the current session record as the history of subsequent nodes
    [DispatchNodeResponseKeyEnum.skipHandleId]: isReferenceMode
      ? []
      : manualOptions
          .filter((item) => item.value !== userSelectedVal)
          .map((item: any) => getHandleId(nodeId, 'source', item.key)),
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      userSelectResult: userSelectedVal
    },
    [DispatchNodeResponseKeyEnum.toolResponse]: userSelectedVal
  };
};
