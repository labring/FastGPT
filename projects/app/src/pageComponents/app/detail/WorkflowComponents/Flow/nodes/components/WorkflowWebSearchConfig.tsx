import React from 'react';
import { Box } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import WebSearchSwitch from '@/components/core/ai/WebSearchSwitch';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { Input_Template_WebSearch } from '@fastgpt/global/core/workflow/template/input';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';

/** 工作流开关在旧节点缺少此输入时也可编辑，首次开启时补齐持久化字段。 */
const WorkflowWebSearchConfig = ({
  nodeId,
  inputs
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
}) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (value) => value.onChangeNode);
  const input = inputs.find((item) => item.key === NodeInputKeyEnum.enableWebSearch);

  return (
    <Box mb={5}>
      <WebSearchSwitch
        isChecked={input?.value === true}
        onChange={(enabled) => {
          onChangeNode({
            nodeId,
            key: NodeInputKeyEnum.enableWebSearch,
            type: 'replaceInput',
            value: { ...Input_Template_WebSearch, ...input, value: enabled }
          });
        }}
      />
    </Box>
  );
};

export default React.memo(WorkflowWebSearchConfig);
