import { Box, Flex } from '@chakra-ui/react';
import React, { useEffect, useMemo, useState } from 'react';
import Header from './Header';
import Edit from './Edit';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { type HttpToolConfigType } from '@fastgpt/global/core/app/type';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';

const HTTPTools = () => {
  const appDetail = useContextSelector(AppContext, (e) => e.appDetail);
  const toolSetData = useMemo(() => {
    const toolSetNode = appDetail.modules.find(
      (item) => item.flowNodeType === FlowNodeTypeEnum.toolSet
    );
    return toolSetNode?.toolConfig?.httpToolSet ?? toolSetNode?.inputs[0]?.value;
  }, [appDetail.modules]);

  const [url, setUrl] = useState(toolSetData?.url || '');
  const [toolList, setToolList] = useState<HttpToolConfigType[]>(toolSetData?.toolList || []);
  const [headerSecret, setHeaderSecret] = useState<StoreSecretValueType>(
    toolSetData?.headerSecret ?? {}
  );
  const [currentTool, setCurrentTool] = useState<HttpToolConfigType>(toolSetData?.toolList?.[0]);
  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>(() => {
    const raw = appDetail.pluginData?.customHeaders as any;
    if (!raw) return {};
    try {
      return typeof raw === 'string' ? JSON.parse(raw) || {} : (raw as Record<string, string>);
    } catch {
      return {};
    }
  });
  useEffect(() => {
    setUrl(toolSetData?.url || '');
    setToolList(toolSetData?.toolList || []);
    setHeaderSecret(toolSetData?.headerSecret ?? {});
    setCurrentTool((prev) =>
      toolSetData?.toolList?.length ? toolSetData.toolList[0] : (undefined as any)
    );
  }, [toolSetData?.url, toolSetData?.headerSecret, toolSetData?.toolList]);

  useEffect(() => {
    const raw = appDetail.pluginData?.customHeaders as any;
    if (!raw) {
      setCustomHeaders({});
      return;
    }
    try {
      setCustomHeaders(
        typeof raw === 'string' ? JSON.parse(raw) || {} : (raw as Record<string, string>)
      );
    } catch {
      setCustomHeaders({});
    }
  }, [appDetail.pluginData?.customHeaders]);

  const [createType] = useState<'batch' | 'manual'>(() => {
    const schemaStr = appDetail.pluginData?.apiSchemaStr;
    return schemaStr != null && String(schemaStr).trim() !== '' ? 'batch' : 'manual';
  });

  console.log('index', appDetail);

  return (
    <Flex h={'100%'} flexDirection={'column'} px={[3, 0]} pr={[3, 3]}>
      <Header url={url} toolList={toolList} headerSecret={headerSecret} />
      <Edit
        url={url}
        setUrl={setUrl}
        toolList={toolList}
        setToolList={setToolList}
        currentTool={currentTool}
        setCurrentTool={setCurrentTool}
        headerSecret={headerSecret}
        setHeaderSecret={setHeaderSecret}
        createType={createType}
        customHeaders={customHeaders}
      />
    </Flex>
  );
};

export default React.memo(HTTPTools);
