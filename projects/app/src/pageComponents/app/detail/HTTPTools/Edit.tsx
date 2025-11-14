import { Box, Flex } from '@chakra-ui/react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import React, { useEffect, useMemo, useState } from 'react';
import styles from '../SimpleApp/styles.module.scss';
import { cardStyles } from '../constants';
import AppCard from './AppCard';
import ChatTest from './ChatTest';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EditForm from './EditForm';
import { type HttpToolConfigType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const Edit = () => {
  const { isPc } = useSystem();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const toolSetData = useMemo(() => {
    const toolSetNode = appDetail.modules.find(
      (item) => item.flowNodeType === FlowNodeTypeEnum.toolSet
    );
    return toolSetNode?.toolConfig?.httpToolSet;
  }, [appDetail.modules]);

  const [currentTool, setCurrentTool] = useState<HttpToolConfigType | undefined>(
    toolSetData?.toolList?.[0]
  );
  const baseUrl = toolSetData?.baseUrl ?? '';
  const toolList = toolSetData?.toolList ?? [];
  const apiSchemaStr = toolSetData?.apiSchemaStr;
  const headerSecret = toolSetData?.headerSecret ?? {};
  const customHeaders = useMemo(() => {
    try {
      return JSON.parse(toolSetData?.customHeaders || '{}') || {};
    } catch {
      return {};
    }
  }, [appDetail.pluginData?.customHeaders]);

  useEffect(() => {
    if (!currentTool || toolList.length === 0) {
      setCurrentTool(toolList[0]);
      return;
    }

    const updatedTool = toolList.find((tool) => tool.name === currentTool.name);
    if (updatedTool) {
      setCurrentTool(updatedTool);
    } else {
      setCurrentTool(toolList[0]);
    }
  }, [toolSetData]);

  return (
    <MyBox
      display={['block', 'flex']}
      flex={'1 0 0'}
      h={0}
      mt={[4, 0]}
      gap={1}
      borderRadius={'lg'}
      overflowY={['auto', 'unset']}
    >
      <Flex
        flexDirection={'column'}
        className={styles.EditAppBox}
        pr={[0, 1]}
        minW={['auto', '580px']}
        mb={3}
        flex={'1 0 0'}
      >
        <Box {...cardStyles} boxShadow={'2'}>
          <AppCard />
        </Box>

        <Box mt={4} {...cardStyles} flex={'1 0 0'} overflow={'auto'} boxShadow={'2'}>
          <EditForm
            currentTool={currentTool}
            setCurrentTool={setCurrentTool}
            toolList={toolList}
            baseUrl={baseUrl}
            apiSchemaStr={apiSchemaStr}
            headerSecret={headerSecret}
            customHeaders={customHeaders}
          />
        </Box>
      </Flex>
      {isPc && (
        <Box flex={'2 0 0'} w={0} mb={3}>
          <ChatTest
            currentTool={currentTool}
            baseUrl={baseUrl}
            headerSecret={headerSecret}
            customHeaders={customHeaders}
          />
        </Box>
      )}
    </MyBox>
  );
};

export default React.memo(Edit);
