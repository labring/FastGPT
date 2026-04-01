import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '../../../../../web/i18n/utils';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps,
  type RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import { runWorkflow } from '..';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type AIChatItemValueItemType,
  type ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import { cloneDeep } from 'lodash';
import { type WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import {
  getReferenceVariableValue,
  storeEdges2RuntimeEdges,
  valueTypeFormat
} from '@fastgpt/global/core/workflow/runtime/utils';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { env } from '../../../../env';
import {
  buildCatchErrorMapForChildren,
  collectChildWorkflowUncaughtErrors
} from '../utils/collectChildWorkflowUncaughtErrors';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.loopProMode]?: 'array' | 'condition';
  [NodeInputKeyEnum.loopInputArray]: unknown;
  [NodeInputKeyEnum.childrenNodeIdList]: string[];
}>;

type Response = DispatchNodeResultType<Record<string, any>, { [NodeOutputKeyEnum.error]?: string }>;

const assertLoopProChildNodes = ({
  childrenNodeIdList,
  runtimeNodes
}: {
  childrenNodeIdList: string[];
  runtimeNodes: RuntimeNodeItemType[];
}) => {
  const forbiddenTypes = new Set<FlowNodeTypeEnum>([
    FlowNodeTypeEnum.batch,
    FlowNodeTypeEnum.loop,
    FlowNodeTypeEnum.loopPro,
    FlowNodeTypeEnum.userSelect,
    FlowNodeTypeEnum.formInput
  ]);

  const hasForbidden = runtimeNodes.some(
    (node) => childrenNodeIdList.includes(node.nodeId) && forbiddenTypes.has(node.flowNodeType)
  );
  if (hasForbidden) {
    throw new Error('Loop child workflow does not allow batch/loop/loop_pro/interactive nodes');
  }
};

function buildLoopProDataOutputs(
  node: RuntimeNodeItemType,
  runtimeNodes: RuntimeNodeItemType[],
  variables: Record<string, any>
): Record<string, any> {
  const data: Record<string, any> = {};
  const nodesMap = new Map(runtimeNodes.map((n) => [n.nodeId, n]));
  const dynamicKeys = node.outputs
    .filter(
      (o) =>
        o.type === FlowNodeOutputTypeEnum.dynamic &&
        o.key !== NodeOutputKeyEnum.addOutputParam &&
        !!o.value
    )
    .map((o) => o.key);

  for (const key of dynamicKeys) {
    const output = node.outputs.find((o) => o.key === key);
    if (!output?.value) continue;
    const v = getReferenceVariableValue({
      value: output.value,
      nodesMap,
      variables
    });
    data[key] = valueTypeFormat(v, output.valueType);
  }

  return data;
}

function loopProFailOnChildUncaughtErrors(
  props: Props,
  runtimeNodes: RuntimeNodeItemType[],
  newVariables: Record<string, any>,
  message: string,
  catchError: boolean | undefined
): Response {
  if (catchError) {
    const dataOnError = buildLoopProDataOutputs(props.node, runtimeNodes, newVariables);
    return {
      error: { [NodeOutputKeyEnum.error]: message },
      data: dataOnError,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: message,
        mergeSignId: props.node.nodeId,
        customOutputs: Object.keys(dataOnError).length > 0 ? dataOnError : undefined
      }
    };
  }
  throw new Error(message);
}

export const dispatchLoopPro = async (props: Props): Promise<Response> => {
  const { params, runtimeEdges, lastInteractive, runtimeNodes, node } = props;
  const {
    loopProMode = 'array',
    loopInputArray = [],
    childrenNodeIdList = []
  } = params as {
    loopProMode?: 'array' | 'condition';
    loopInputArray?: unknown;
    childrenNodeIdList?: string[];
  };

  await assertLoopProChildNodes({ childrenNodeIdList, runtimeNodes });

  const maxTimes = env.WORKFLOW_MAX_LOOP_TIMES;
  const { name, catchError } = node;

  const pushFailureOrThrow = (message: string): Response => {
    if (catchError) {
      return {
        error: {
          [NodeOutputKeyEnum.error]: message
        },
        data: {},
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          errorText: message,
          mergeSignId: props.node.nodeId
        }
      };
    }
    throw new Error(message);
  };

  if (loopProMode === 'array') {
    if (!Array.isArray(loopInputArray)) {
      return pushFailureOrThrow('Input value is not an array');
    }
    if (loopInputArray.length > maxTimes) {
      return pushFailureOrThrow(i18nT('workflow:loop_max_reached'));
    }
    return runLoopProArrayMode(props);
  }

  /* condition */
  return runLoopProConditionMode(props, maxTimes);
};

async function runLoopProArrayMode(props: Props): Promise<Response> {
  const {
    params,
    runtimeEdges,
    lastInteractive,
    runtimeNodes,
    node: { name, catchError }
  } = props;
  const { loopInputArray = [], childrenNodeIdList = [] } = params as {
    loopInputArray?: any[];
    childrenNodeIdList?: string[];
  };

  const catchErrorByNodeId = buildCatchErrorMapForChildren(runtimeNodes, childrenNodeIdList);

  let interactiveData =
    lastInteractive?.type === 'loopInteractive' ? lastInteractive?.params : undefined;
  let lastIndex = interactiveData?.currentIndex;

  const outputValueArr = interactiveData ? interactiveData.loopResult : [];
  const loopResponseDetail: ChatHistoryItemResType[] = [];
  let assistantResponses: AIChatItemValueItemType[] = [];
  const customFeedbacks: string[] = [];
  let totalPoints = 0;
  let newVariables: Record<string, any> = props.variables;
  let interactiveResponse: WorkflowInteractiveResponseType | undefined = undefined;
  let index = 0;

  for await (const item of loopInputArray as any[]) {
    if (lastIndex !== undefined && index < lastIndex) {
      index++;
      continue;
    }

    const isInteractiveResponseIndex = !!interactiveData && index === interactiveData?.currentIndex;

    if (isInteractiveResponseIndex) {
      runtimeNodes.forEach((n) => {
        if (interactiveData?.childrenResponse?.entryNodeIds.includes(n.nodeId)) {
          n.isEntry = true;
        }
      });
    } else {
      runtimeNodes.forEach((n) => {
        if (!childrenNodeIdList.includes(n.nodeId)) return;
        if (n.flowNodeType === FlowNodeTypeEnum.loopStart) {
          n.isEntry = true;
          n.inputs.forEach((input) => {
            if (input.key === NodeInputKeyEnum.loopStartInput) {
              input.value = item;
            } else if (input.key === NodeInputKeyEnum.loopStartIndex) {
              input.value = index + 1;
            }
          });
        }
      });
    }

    index++;

    let response;
    try {
      response = await runWorkflow({
        ...props,
        usageId: undefined,
        lastInteractive: interactiveData?.childrenResponse,
        variables: newVariables,
        runtimeNodes,
        runtimeEdges: cloneDeep(
          storeEdges2RuntimeEdges(runtimeEdges, interactiveData?.childrenResponse)
        )
      });
    } catch (error) {
      const text = getErrText(error);
      if (catchError) {
        const dataOnError = buildLoopProDataOutputs(props.node, runtimeNodes, newVariables);
        return {
          error: { [NodeOutputKeyEnum.error]: text },
          data: dataOnError,
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            errorText: text,
            mergeSignId: props.node.nodeId,
            customOutputs: Object.keys(dataOnError).length > 0 ? dataOnError : undefined
          }
        };
      }
      throw new Error(text);
    }

    const uncaught = collectChildWorkflowUncaughtErrors(
      response.flowResponses,
      childrenNodeIdList,
      catchErrorByNodeId
    );
    if (uncaught.length > 0) {
      return loopProFailOnChildUncaughtErrors(
        props,
        runtimeNodes,
        newVariables,
        uncaught.join('\n'),
        catchError
      );
    }

    const loopEndList = response.flowResponses.filter(
      (res) =>
        res.moduleType === FlowNodeTypeEnum.loopProEnd ||
        res.moduleType === FlowNodeTypeEnum.loopEnd
    );
    const loopOutputValue = loopEndList[loopEndList.length - 1]?.loopOutputValue;

    if (!response.workflowInteractiveResponse) {
      outputValueArr.push(loopOutputValue);
    }
    loopResponseDetail.push(...response.flowResponses);
    assistantResponses.push(...response.assistantResponses);
    totalPoints += response.flowUsages.reduce((acc, usage) => acc + usage.totalPoints, 0);

    if (response[DispatchNodeResponseKeyEnum.customFeedbacks]) {
      customFeedbacks.push(...response[DispatchNodeResponseKeyEnum.customFeedbacks]);
    }

    newVariables = {
      ...newVariables,
      ...response.newVariables
    };

    if (response.workflowInteractiveResponse) {
      interactiveResponse = response.workflowInteractiveResponse;
      break;
    }

    if (loopEndList.length > 0) {
      break;
    }

    interactiveData = undefined;
    lastIndex = undefined;
  }

  const dataOutputs = buildLoopProDataOutputs(props.node, runtimeNodes, newVariables);

  return {
    data: dataOutputs,
    [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse
      ? {
          type: 'loopInteractive',
          params: {
            currentIndex: index - 1,
            childrenResponse: interactiveResponse,
            loopResult: outputValueArr
          }
        }
      : undefined,
    [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints,
      loopInput: loopInputArray,
      loopResult: outputValueArr,
      loopDetail: loopResponseDetail,
      mergeSignId: props.node.nodeId,
      customOutputs: Object.keys(dataOutputs).length > 0 ? dataOutputs : undefined
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: totalPoints
      ? [
          {
            totalPoints,
            moduleName: name
          }
        ]
      : [],
    [DispatchNodeResponseKeyEnum.newVariables]: newVariables,
    [DispatchNodeResponseKeyEnum.customFeedbacks]:
      customFeedbacks.length > 0 ? customFeedbacks : undefined
  };
}

async function runLoopProConditionMode(props: Props, maxTimes: number): Promise<Response> {
  const {
    params,
    runtimeEdges,
    runtimeNodes,
    node: { name, catchError }
  } = props;
  const { childrenNodeIdList = [] } = params as { childrenNodeIdList?: string[] };

  const catchErrorByNodeId = buildCatchErrorMapForChildren(runtimeNodes, childrenNodeIdList);

  const loopResponseDetail: ChatHistoryItemResType[] = [];
  let assistantResponses: AIChatItemValueItemType[] = [];
  const customFeedbacks: string[] = [];
  let totalPoints = 0;
  let newVariables: Record<string, any> = props.variables;
  const collectedLoopEndValues: any[] = [];

  for (let round = 1; round <= maxTimes; round++) {
    runtimeNodes.forEach((n) => {
      if (!childrenNodeIdList.includes(n.nodeId)) return;
      if (n.flowNodeType === FlowNodeTypeEnum.loopStart) {
        n.isEntry = true;
        n.inputs.forEach((input) => {
          if (input.key === NodeInputKeyEnum.loopStartInput) {
            input.value = undefined;
          } else if (input.key === NodeInputKeyEnum.loopStartIndex) {
            input.value = round;
          }
        });
      }
    });

    let response;
    try {
      response = await runWorkflow({
        ...props,
        usageId: undefined,
        lastInteractive: undefined,
        variables: newVariables,
        runtimeNodes,
        runtimeEdges: cloneDeep(storeEdges2RuntimeEdges(runtimeEdges, undefined))
      });
    } catch (error) {
      const text = getErrText(error);
      if (catchError) {
        const dataOnError = buildLoopProDataOutputs(props.node, runtimeNodes, newVariables);
        return {
          error: { [NodeOutputKeyEnum.error]: text },
          data: dataOnError,
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            errorText: text,
            mergeSignId: props.node.nodeId,
            customOutputs: Object.keys(dataOnError).length > 0 ? dataOnError : undefined
          }
        };
      }
      throw new Error(text);
    }

    if (response.workflowInteractiveResponse) {
      if (catchError) {
        const dataOnError = buildLoopProDataOutputs(props.node, runtimeNodes, newVariables);
        return {
          error: {
            [NodeOutputKeyEnum.error]:
              'Condition loop does not support interactive nodes in child workflow'
          },
          data: dataOnError,
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            errorText: 'Condition loop does not support interactive nodes in child workflow',
            mergeSignId: props.node.nodeId,
            customOutputs: Object.keys(dataOnError).length > 0 ? dataOnError : undefined
          }
        };
      }
      throw new Error('Condition loop does not support interactive nodes in child workflow');
    }

    const uncaught = collectChildWorkflowUncaughtErrors(
      response.flowResponses,
      childrenNodeIdList,
      catchErrorByNodeId
    );
    if (uncaught.length > 0) {
      return loopProFailOnChildUncaughtErrors(
        props,
        runtimeNodes,
        newVariables,
        uncaught.join('\n'),
        catchError
      );
    }

    const loopEndList = response.flowResponses.filter(
      (res) =>
        res.moduleType === FlowNodeTypeEnum.loopProEnd ||
        res.moduleType === FlowNodeTypeEnum.loopEnd
    );
    const loopEndRes = loopEndList[loopEndList.length - 1];
    const loopOutputValue = loopEndRes?.loopOutputValue;

    loopResponseDetail.push(...response.flowResponses);
    assistantResponses.push(...response.assistantResponses);
    totalPoints += response.flowUsages.reduce((acc, usage) => acc + usage.totalPoints, 0);
    if (response[DispatchNodeResponseKeyEnum.customFeedbacks]) {
      customFeedbacks.push(...response[DispatchNodeResponseKeyEnum.customFeedbacks]);
    }
    newVariables = {
      ...newVariables,
      ...response.newVariables
    };

    if (loopEndRes) {
      collectedLoopEndValues.push(loopOutputValue);
      const dataOutputs = buildLoopProDataOutputs(props.node, runtimeNodes, newVariables);
      return {
        data: dataOutputs,
        [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          totalPoints,
          loopResult: collectedLoopEndValues,
          loopDetail: loopResponseDetail,
          mergeSignId: props.node.nodeId,
          customOutputs: Object.keys(dataOutputs).length > 0 ? dataOutputs : undefined
        },
        [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: totalPoints
          ? [{ totalPoints, moduleName: name }]
          : [],
        [DispatchNodeResponseKeyEnum.newVariables]: newVariables,
        [DispatchNodeResponseKeyEnum.customFeedbacks]:
          customFeedbacks.length > 0 ? customFeedbacks : undefined
      };
    }
  }

  if (catchError) {
    const msg = i18nT('workflow:loop_max_reached');
    const dataOnError = buildLoopProDataOutputs(props.node, runtimeNodes, newVariables);
    return {
      error: { [NodeOutputKeyEnum.error]: msg },
      data: dataOnError,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: msg,
        mergeSignId: props.node.nodeId,
        customOutputs: Object.keys(dataOnError).length > 0 ? dataOnError : undefined
      }
    };
  }
  throw new Error(i18nT('workflow:loop_max_reached'));
}
