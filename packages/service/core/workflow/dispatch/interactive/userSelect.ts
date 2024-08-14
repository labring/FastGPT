import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import type {
  UserSelectInteractive,
  UserSelectOptionItemType
} from '@fastgpt/global/core/workflow/template/system/userSelect/type';
import { updateUserSelectedResult } from '../../../chat/controller';
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.description]: string;
  [NodeInputKeyEnum.userSelectOptions]: UserSelectOptionItemType[];
}>;
type UserSelectResponse = DispatchNodeResultType<{
  [DispatchNodeResponseKeyEnum.interactive]?: UserSelectInteractive;
  [NodeOutputKeyEnum.selectResult]?: string;
}>;

export const dispatchUserSelect = async (props: Props): Promise<UserSelectResponse> => {
  const {
    histories,
    app: { _id: appId },
    chatId,
    node: { nodeId, isEntry },
    params: { description, userSelectOptions }
  } = props;

  // Interactive node is not the entry node, return interactive result
  if (!isEntry) {
    return {
      [DispatchNodeResponseKeyEnum.interactive]: {
        type: 'userSelect',
        params: {
          userSelectOptions,
          description
        }
      }
    };
  }

  const lastInteractiveValue = getLastInteractiveValue(histories);
  const userSelectedVal = lastInteractiveValue?.params?.userSelectedVal;

  // Error status
  if (userSelectedVal === undefined) {
    return {
      [DispatchNodeResponseKeyEnum.skipHandleId]: userSelectOptions.map((item) =>
        getHandleId(nodeId, 'source', item.value)
      )
    };
  }

  updateUserSelectedResult({
    appId,
    chatId,
    userSelectedVal
  });

  return {
    [DispatchNodeResponseKeyEnum.skipHandleId]: userSelectOptions
      .filter((item, index: number) => item.value !== userSelectedVal)
      .map((item: any) => getHandleId(nodeId, 'source', item.key)),
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      userSelectResult: userSelectedVal
    },
    [NodeOutputKeyEnum.selectResult]: userSelectedVal
  };
};
