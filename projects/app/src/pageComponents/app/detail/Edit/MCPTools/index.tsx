import { Flex } from '@chakra-ui/react';
import React, { useMemo, useState } from 'react';
import Header from './Header';
import Edit from './Edit';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { type McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';

const MCPTools = () => {
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const toolSetData = useMemo(() => {
    const toolSetNode = appDetail.nodes.find(
      (item) => item.flowNodeType === FlowNodeTypeEnum.toolSet
    );
    return toolSetNode?.toolConfig?.mcpToolSet ?? toolSetNode?.inputs[0].value;
  }, [appDetail.nodes]);

  const [url, setUrl] = useState(toolSetData?.url || '');
  // 工具定义与当前正在编辑的 URL 分开保存；只有成功解析才能更新来源。
  const [toolSourceUrl, setToolSourceUrl] = useState(toolSetData?.url ?? '');
  const [toolList, setToolList] = useState<McpToolConfigType[]>(toolSetData?.toolList || []);
  const [headerSecret, setHeaderSecret] = useState<StoreSecretValueType>(
    toolSetData?.headerSecret ?? {}
  );
  const [currentTool, setCurrentTool] = useState<McpToolConfigType>(toolSetData.toolList[0]);

  return (
    <Flex h={'100%'} flexDirection={'column'} px={[3, 0]} pr={[3, 3]} bg={'myGray.25'}>
      <Header
        url={url}
        toolList={toolList}
        headerSecret={headerSecret}
        toolSourceUrl={toolSourceUrl}
      />
      <Edit
        url={url}
        setUrl={setUrl}
        toolSourceUrl={toolSourceUrl}
        setToolSourceUrl={setToolSourceUrl}
        toolList={toolList}
        setToolList={setToolList}
        currentTool={currentTool}
        setCurrentTool={setCurrentTool}
        headerSecret={headerSecret}
        setHeaderSecret={setHeaderSecret}
      />
    </Flex>
  );
};

export default React.memo(MCPTools);
