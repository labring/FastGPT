import { Box, Flex } from '@chakra-ui/react';
import React, { useMemo, useState } from 'react';
import Header from './Header';
import Edit from './Edit';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { type ToolType } from '@fastgpt/global/core/app/type';
import { type MCPToolSetData } from '@/pageComponents/dashboard/apps/MCPToolsEditModal';

const MCPTools = () => {
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const toolSetData = useMemo(() => {
    const toolSetNode = appDetail.modules.find(
      (item) => item.flowNodeType === FlowNodeTypeEnum.toolSet
    );
    return toolSetNode?.inputs[0].value as MCPToolSetData;
  }, [appDetail.modules]);

  const [url, setUrl] = useState(toolSetData?.url || '');
  const [toolList, setToolList] = useState<ToolType[]>(toolSetData?.toolList || []);
  const [currentTool, setCurrentTool] = useState<ToolType | null>(toolSetData?.toolList[0] || null);

  return (
    <Flex h={'100%'} flexDirection={'column'} px={[3, 0]} pr={[3, 3]}>
      <Header url={url} toolList={toolList} />
      <Edit
        url={url}
        setUrl={setUrl}
        toolList={toolList}
        setToolList={setToolList}
        currentTool={currentTool}
        setCurrentTool={setCurrentTool}
      />
    </Flex>
  );
};

export default React.memo(MCPTools);
