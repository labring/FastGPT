import { ChatCompletionRequestMessageRoleEnum } from '../../ai/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum, WorkflowIOValueTypeEnum } from '../constants';
import { FlowNodeTypeEnum } from '../node/constant';
import { StoreNodeItemType } from '../type/node';
import { StoreEdgeItemType } from '../type/edge';
import { RuntimeEdgeItemType, RuntimeNodeItemType } from './type';
import { VARIABLE_NODE_ID } from '../constants';
import { isValidReferenceValueFormat } from '../utils';
import { FlowNodeOutputItemType, ReferenceValueType } from '../type/io';
import { ChatItemType, NodeOutputItemType } from '../../../core/chat/type';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '../../../core/chat/constants';
import { replaceVariable, valToStr } from '../../../common/string/tools';
import { ChatCompletionChunk } from 'openai/resources';

export const getMaxHistoryLimitFromNodes = (nodes: StoreNodeItemType[]): number => {
  let limit = 10;
  nodes.forEach((node) => {
    node.inputs.forEach((input) => {
      if (
        (input.key === NodeInputKeyEnum.history ||
          input.key === NodeInputKeyEnum.historyMaxAmount) &&
        typeof input.value === 'number'
      ) {
        limit = Math.max(limit, input.value);
      }
    });
  });

  return limit * 2;
};

/* 
  Get interaction information (if any) from the last AI message.
  What can be done:
  1. Get the interactive data
  2. Check that the workflow starts at the interaction node
*/
export const getLastInteractiveValue = (histories: ChatItemType[]) => {
  const lastAIMessage = [...histories].reverse().find((item) => item.obj === ChatRoleEnum.AI);

  if (lastAIMessage) {
    const lastValue = lastAIMessage.value[lastAIMessage.value.length - 1];

    if (
      !lastValue ||
      lastValue.type !== ChatItemValueTypeEnum.interactive ||
      !lastValue.interactive
    ) {
      return null;
    }

    // Check is user select
    if (
      lastValue.interactive.type === 'userSelect' &&
      !lastValue.interactive.params.userSelectedVal
    ) {
      return lastValue.interactive;
    }

    // Check is user input
    if (lastValue.interactive.type === 'userInput' && !lastValue.interactive.params.submitted) {
      return lastValue.interactive;
    }
  }

  return null;
};

export const initWorkflowEdgeStatus = (
  edges: StoreEdgeItemType[],
  histories?: ChatItemType[]
): RuntimeEdgeItemType[] => {
  // If there is a history, use the last interactive value
  if (histories && histories.length > 0) {
    const memoryEdges = getLastInteractiveValue(histories)?.memoryEdges;

    if (memoryEdges && memoryEdges.length > 0) {
      return memoryEdges;
    }
  }

  return (
    edges?.map((edge) => ({
      ...edge,
      status: 'waiting'
    })) || []
  );
};

export const getWorkflowEntryNodeIds = (
  nodes: (StoreNodeItemType | RuntimeNodeItemType)[],
  histories?: ChatItemType[]
) => {
  // If there is a history, use the last interactive entry node
  if (histories && histories.length > 0) {
    const entryNodeIds = getLastInteractiveValue(histories)?.entryNodeIds;

    if (Array.isArray(entryNodeIds) && entryNodeIds.length > 0) {
      return entryNodeIds;
    }
  }

  const entryList = [
    FlowNodeTypeEnum.systemConfig,
    FlowNodeTypeEnum.workflowStart,
    FlowNodeTypeEnum.pluginInput
  ];
  return nodes
    .filter((node) => entryList.includes(node.flowNodeType as any))
    .map((item) => item.nodeId);
};

export const storeNodes2RuntimeNodes = (
  nodes: StoreNodeItemType[],
  entryNodeIds: string[]
): RuntimeNodeItemType[] => {
  return (
    nodes.map<RuntimeNodeItemType>((node) => {
      return {
        nodeId: node.nodeId,
        name: node.name,
        avatar: node.avatar,
        intro: node.intro,
        flowNodeType: node.flowNodeType,
        showStatus: node.showStatus,
        isEntry: entryNodeIds.includes(node.nodeId),
        inputs: node.inputs,
        outputs: node.outputs,
        pluginId: node.pluginId,
        version: node.version
      };
    }) || []
  );
};

export const filterWorkflowEdges = (edges: RuntimeEdgeItemType[]) => {
  return edges.filter(
    (edge) =>
      edge.sourceHandle !== NodeOutputKeyEnum.selectedTools &&
      edge.targetHandle !== NodeOutputKeyEnum.selectedTools
  );
};

/* 
  1. 输入线分类：普通线和递归线（可以追溯到自身）
  2. 起始线全部非 waiting 执行，或递归线全部非 waiting 执行
*/
export const checkNodeRunStatus = ({
  node,
  runtimeEdges
}: {
  node: RuntimeNodeItemType;
  runtimeEdges: RuntimeEdgeItemType[];
}) => {
  /* 
    区分普通连线和递归连线
    递归连线：可以通过往上查询 nodes，最终追溯到自身
  */
  const splitEdges2WorkflowEdges = ({
    sourceEdges,
    allEdges,
    currentNode
  }: {
    sourceEdges: RuntimeEdgeItemType[];
    allEdges: RuntimeEdgeItemType[];
    currentNode: RuntimeNodeItemType;
  }) => {
    const commonEdges: RuntimeEdgeItemType[] = [];
    const recursiveEdges: RuntimeEdgeItemType[] = [];

    const checkIsCircular = (edge: RuntimeEdgeItemType, visited: Set<string>): boolean => {
      if (edge.source === currentNode.nodeId) {
        return true; // 检测到环,并且环中包含当前节点
      }
      if (visited.has(edge.source)) {
        return false; // 检测到环,但不包含当前节点(子节点成环)
      }
      visited.add(edge.source);

      // 递归检测后面的 edge，如果有其中一个成环，则返回 true
      const nextEdges = allEdges.filter((item) => item.target === edge.source);
      return nextEdges.some((nextEdge) => checkIsCircular(nextEdge, new Set(visited)));
    };

    sourceEdges.forEach((edge) => {
      if (checkIsCircular(edge, new Set([currentNode.nodeId]))) {
        recursiveEdges.push(edge);
      } else {
        commonEdges.push(edge);
      }
    });

    return { commonEdges, recursiveEdges };
  };

  const runtimeNodeSourceEdge = filterWorkflowEdges(runtimeEdges).filter(
    (item) => item.target === node.nodeId
  );

  // Entry
  if (runtimeNodeSourceEdge.length === 0) {
    return 'run';
  }

  // Classify edges
  const { commonEdges, recursiveEdges } = splitEdges2WorkflowEdges({
    sourceEdges: runtimeNodeSourceEdge,
    allEdges: runtimeEdges,
    currentNode: node
  });

  // check active（其中一组边，至少有一个 active，且没有 waiting 即可运行）
  if (
    commonEdges.length > 0 &&
    commonEdges.some((item) => item.status === 'active') &&
    commonEdges.every((item) => item.status !== 'waiting')
  ) {
    return 'run';
  }
  if (
    recursiveEdges.length > 0 &&
    recursiveEdges.some((item) => item.status === 'active') &&
    recursiveEdges.every((item) => item.status !== 'waiting')
  ) {
    return 'run';
  }

  // check skip（其中一组边，全是 skiped 则跳过运行）
  if (commonEdges.length > 0 && commonEdges.every((item) => item.status === 'skipped')) {
    return 'skip';
  }
  if (recursiveEdges.length > 0 && recursiveEdges.every((item) => item.status === 'skipped')) {
    return 'skip';
  }

  return 'wait';
};

/* 
  Get the value of the reference variable/node output
  1. [string,string]
  2. [string,string][]
*/
export const getReferenceVariableValue = ({
  value,
  nodes,
  variables
}: {
  value?: ReferenceValueType;
  nodes: RuntimeNodeItemType[];
  variables: Record<string, any>;
}) => {
  if (!value) return value;

  // handle single reference value
  if (isValidReferenceValueFormat(value)) {
    const sourceNodeId = value[0];
    const outputId = value[1];

    if (sourceNodeId === VARIABLE_NODE_ID) {
      if (!outputId) return undefined;
      return variables[outputId];
    }

    // 避免 value 刚好就是二个元素的字符串数组
    const node = nodes.find((node) => node.nodeId === sourceNodeId);
    if (!node) {
      return value;
    }

    return node.outputs.find((output) => output.id === outputId)?.value;
  }

  // handle reference array
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => isValidReferenceValueFormat(item))
  ) {
    const result = value.map<any>((val) => {
      return getReferenceVariableValue({
        value: val,
        nodes,
        variables
      });
    });

    return result.flat().filter((item) => item !== undefined);
  }

  return value;
};

export const formatVariableValByType = (val: any, valueType?: WorkflowIOValueTypeEnum) => {
  if (!valueType) return val;
  if (val === undefined || val === null) return;
  // Value type check, If valueType invalid, return undefined
  if (valueType.startsWith('array') && !Array.isArray(val)) return undefined;
  if (valueType === WorkflowIOValueTypeEnum.boolean) return Boolean(val);
  if (valueType === WorkflowIOValueTypeEnum.number) return Number(val);
  if (valueType === WorkflowIOValueTypeEnum.string) {
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  }
  if (
    [
      WorkflowIOValueTypeEnum.object,
      WorkflowIOValueTypeEnum.chatHistory,
      WorkflowIOValueTypeEnum.datasetQuote,
      WorkflowIOValueTypeEnum.selectApp,
      WorkflowIOValueTypeEnum.selectDataset
    ].includes(valueType) &&
    typeof val !== 'object'
  )
    return undefined;

  return val;
};
// replace {{$xx.xx$}} variables for text
export function replaceEditorVariable({
  text,
  nodes,
  variables
}: {
  text: any;
  nodes: RuntimeNodeItemType[];
  variables: Record<string, any>; // global variables
}) {
  if (typeof text !== 'string') return text;

  text = replaceVariable(text, variables);

  const variablePattern = /\{\{\$([^.]+)\.([^$]+)\$\}\}/g;
  const matches = [...text.matchAll(variablePattern)];
  if (matches.length === 0) return text;

  matches.forEach((match) => {
    const nodeId = match[1];
    const id = match[2];

    const variableVal = (() => {
      if (nodeId === VARIABLE_NODE_ID) {
        return variables[id];
      }
      // Find upstream node input/output
      const node = nodes.find((node) => node.nodeId === nodeId);
      if (!node) return;

      const output = node.outputs.find((output) => output.id === id);
      if (output) return formatVariableValByType(output.value, output.valueType);

      // Use the node's input as the variable value(Example: HTTP data will reference its own dynamic input)
      const input = node.inputs.find((input) => input.key === id);
      if (input) return getReferenceVariableValue({ value: input.value, nodes, variables });
    })();

    const formatVal = valToStr(variableVal);

    const regex = new RegExp(`\\{\\{\\$(${nodeId}\\.${id})\\$\\}\\}`, 'g');
    text = text.replace(regex, () => formatVal);
  });

  return text || '';
}

export const textAdaptGptResponse = ({
  text,
  reasoning_content,
  model = '',
  finish_reason = null,
  extraData = {}
}: {
  model?: string;
  text?: string | null;
  reasoning_content?: string | null;
  finish_reason?: null | 'stop';
  extraData?: Object;
}) => {
  return {
    ...extraData,
    id: '',
    object: '',
    created: 0,
    model,
    choices: [
      {
        delta: {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: text,
          ...(reasoning_content && { reasoning_content })
        },
        index: 0,
        finish_reason
      }
    ]
  };
};

/* Update runtimeNode's outputs with interactive data from history */
export function rewriteNodeOutputByHistories(
  histories: ChatItemType[],
  runtimeNodes: RuntimeNodeItemType[]
) {
  const interactive = getLastInteractiveValue(histories);
  if (!interactive?.nodeOutputs) {
    return runtimeNodes;
  }

  return runtimeNodes.map((node) => {
    return {
      ...node,
      outputs: node.outputs.map((output: FlowNodeOutputItemType) => {
        return {
          ...output,
          value:
            interactive?.nodeOutputs?.find(
              (item: NodeOutputItemType) => item.nodeId === node.nodeId && item.key === output.key
            )?.value || output?.value
        };
      })
    };
  });
}

// Parse <think></think> tags to think and answer - unstream response
export const parseReasoningContent = (text: string): [string, string] => {
  const regex = /<think>([\s\S]*?)<\/think>/;
  const match = text.match(regex);

  if (!match) {
    return ['', text];
  }

  const thinkContent = match[1].trim();

  // Add answer (remaining text after think tag)
  const answerContent = text.slice(match.index! + match[0].length);

  return [thinkContent, answerContent];
};

// Parse <think></think> tags to think and answer - stream response
export const parseReasoningStreamContent = () => {
  let isInThinkTag: boolean | undefined;

  const startTag = '<think>';
  let startTagBuffer = '';

  const endTag = '</think>';
  let endTagBuffer = '';

  /* 
    parseReasoning - 只控制是否主动解析 <think></think>，如果接口已经解析了，仍然会返回 think 内容。
  */
  const parsePart = (
    part: {
      choices: {
        delta: {
          content?: string;
          reasoning_content?: string;
        };
      }[];
    },
    parseReasoning = false
  ): [string, string] => {
    const content = part.choices?.[0]?.delta?.content || '';

    // @ts-ignore
    const reasoningContent = part.choices?.[0]?.delta?.reasoning_content || '';
    if (reasoningContent || !parseReasoning) {
      isInThinkTag = false;
      return [reasoningContent, content];
    }

    if (!content) {
      return ['', ''];
    }

    // 如果不在 think 标签中，或者有 reasoningContent(接口已解析），则返回 reasoningContent 和 content
    if (isInThinkTag === false) {
      return ['', content];
    }

    // 检测是否为 think 标签开头的数据
    if (isInThinkTag === undefined) {
      // Parse content think and answer
      startTagBuffer += content;
      // 太少内容时候，暂时不解析
      if (startTagBuffer.length < startTag.length) {
        return ['', ''];
      }

      if (startTagBuffer.startsWith(startTag)) {
        isInThinkTag = true;
        return [startTagBuffer.slice(startTag.length), ''];
      }

      // 如果未命中 think 标签，则认为不在 think 标签中，返回 buffer 内容作为 content
      isInThinkTag = false;
      return ['', startTagBuffer];
    }

    // 确认是 think 标签内容，开始返回 think 内容，并实时检测 </think>
    /* 
      检测 </think> 方案。
      存储所有疑似 </think> 的内容，直到检测到完整的 </think> 标签或超出 </think> 长度。
      content 返回值包含以下几种情况:
        abc - 完全未命中尾标签
        abc<th - 命中一部分尾标签
        abc</think> - 完全命中尾标签
        abc</think>abc - 完全命中尾标签
        </think>abc - 完全命中尾标签
        k>abc - 命中一部分尾标签
    */
    // endTagBuffer 专门用来记录疑似尾标签的内容
    if (endTagBuffer) {
      endTagBuffer += content;
      if (endTagBuffer.includes(endTag)) {
        isInThinkTag = false;
        const answer = endTagBuffer.slice(endTag.length);
        return ['', answer];
      } else if (endTagBuffer.length >= endTag.length) {
        // 缓存内容超出尾标签长度，且仍未命中 </think>，则认为本次猜测 </think> 失败，仍处于 think 阶段。
        const tmp = endTagBuffer;
        endTagBuffer = '';
        return [tmp, ''];
      }
      return ['', ''];
    } else if (content.includes(endTag)) {
      // 返回内容，完整命中</think>，直接结束
      isInThinkTag = false;
      const [think, answer] = content.split(endTag);
      return [think, answer];
    } else {
      // 无 buffer，且未命中 </think>，开始疑似 </think> 检测。
      for (let i = 1; i < endTag.length; i++) {
        const partialEndTag = endTag.slice(0, i);
        // 命中一部分尾标签
        if (content.endsWith(partialEndTag)) {
          const think = content.slice(0, -partialEndTag.length);
          endTagBuffer += partialEndTag;
          return [think, ''];
        }
      }
    }

    // 完全未命中尾标签，还是 think 阶段。
    return [content, ''];
  };

  const getStartTagBuffer = () => startTagBuffer;

  return {
    parsePart,
    getStartTagBuffer
  };
};
