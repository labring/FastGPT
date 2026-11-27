import { testModel } from '@/web/core/ai/model/api';
import { Table, Thead, Tbody, Tr, Th, Td, Box, Flex, Button, HStack } from '@chakra-ui/react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useModelConfig } from '@/web/core/ai/model/useModelConfig';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';

type ModelTestItem = {
  avatar: string;
  modelId: string;
  model: string;
  mappedModel: string;
  status: 'waiting' | 'running' | 'success' | 'error';
  message?: string;
  duration?: number;
  loading?: boolean; // 单个模型的loading状态
};

/** 按渠道持久化 model_mapping 展示配置映射；非空目标按原字符串使用，与 AIProxy 行为一致。 */
const getConfiguredMappedModel = (model: string, modelMapping?: Record<string, string>): string => {
  if (!modelMapping || !Object.prototype.hasOwnProperty.call(modelMapping, model)) {
    return model;
  }
  const mapped = modelMapping[model];
  return mapped !== '' ? mapped : model;
};

const ModelTest = ({
  channelId,
  models,
  modelMapping,
  channelType,
  onClose
}: {
  channelId: number;
  models: string[];
  modelMapping?: Record<string, string>;
  channelType: ChannelType;
  onClose: () => void;
}) => {
  const { t, i18n } = useSafeTranslation();
  const {
    getModelProvider,
    models: availableModels,
    loading: loadingModels
  } = useModelConfig({ channelType, language: i18n.language });
  const { toast } = useToast();
  const [testModelList, setTestModelList] = useState<ModelTestItem[]>([]);
  const hasAutoStartedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const statusMap = useMemo(
    () =>
      ({
        waiting: {
          label: t('config_model:waiting_test'),
          colorSchema: 'gray'
        },
        running: {
          label: t('config_model:running_test'),
          colorSchema: 'blue'
        },
        success: {
          label: t('common:Success'),
          colorSchema: 'green'
        },
        error: {
          label: t('common:failed'),
          colorSchema: 'red'
        }
      }) as const,
    [t]
  );

  /** 执行单个模型测试并更新对应行状态，卸载后忽略滞后回调。 */
  const executeSingleModelTest = async (modelId: string): Promise<boolean> => {
    if (!mountedRef.current) return true;
    setTestModelList((prev) =>
      prev.map((item) =>
        item.modelId === modelId ? { ...item, status: 'running', message: '', loading: true } : item
      )
    );
    const start = Date.now();
    try {
      await testModel({ modelId, channelId, channelType });
      if (!mountedRef.current) return true;
      const duration = Date.now() - start;
      setTestModelList((prev) =>
        prev.map((item) =>
          item.modelId === modelId
            ? { ...item, status: 'success', duration: duration / 1000, loading: false }
            : item
        )
      );
      return true;
    } catch (error) {
      if (!mountedRef.current) return false;
      setTestModelList((prev) =>
        prev.map((item) =>
          item.modelId === modelId
            ? { ...item, status: 'error', message: getErrText(error), loading: false }
            : item
        )
      );
      return false;
    }
  };

  const { run: onStartTest, loading: isAnyModelLoading } = useRequest(
    async (targetList?: ModelTestItem[]) => {
      const listToRun = targetList ?? testModelList;
      if (listToRun.length === 0) return;

      let errorNum = 0;
      setTestModelList((prev) =>
        prev.map((item) => ({ ...item, status: 'waiting', message: '', loading: true }))
      );

      await batchRun(
        listToRun,
        async (testItem) => {
          const ok = await executeSingleModelTest(testItem.modelId);
          if (!ok) errorNum++;
        },
        5
      );

      if (mountedRef.current && errorNum > 0) {
        toast({
          status: 'warning',
          title: t('config_model:test_failed', { num: errorNum })
        });
      }
    },
    {
      manual: true
    }
  );

  useEffect(() => {
    if (loadingModels || hasAutoStartedRef.current) return;

    const list = models.flatMap((model) => {
      const modelData = availableModels.find((item) => item.model === model);
      if (!modelData) return [];
      const provider = getModelProvider(modelData.provider, i18n.language);

      return [
        {
          avatar: provider.avatar || HUGGING_FACE_ICON,
          modelId: modelData.modelId,
          model: modelData.model,
          mappedModel: getConfiguredMappedModel(modelData.model, modelMapping),
          status: 'waiting' as const,
          loading: false
        }
      ];
    });
    setTestModelList((prev) => (list.length === 0 && prev.length === 0 ? prev : list));

    // 弹窗打开且模型元数据就绪后自动执行一次批量测试，无需用户再手动点击。
    if (list.length > 0) {
      hasAutoStartedRef.current = true;
      onStartTest(list);
    }
  }, [
    availableModels,
    getModelProvider,
    i18n.language,
    loadingModels,
    modelMapping,
    models,
    onStartTest
  ]);

  const { run: onTestOneModel, loading: testingOneModel } = useRequest(
    async (modelId: string) => {
      if (!testModelList.some((item) => item.modelId === modelId)) return;
      await executeSingleModelTest(modelId);
    },
    {
      manual: true
    }
  );

  const isTesting = isAnyModelLoading || testingOneModel;

  return (
    <MyModal
      isLoading={loadingModels}
      title={t('config_model:channel_test')}
      w={'100%'}
      maxW={['90vw', '1090px']}
      h={'80vh'}
      overflow={'hidden'}
      bodyStyles={{ overflow: 'hidden' }}
      isOpen
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button isLoading={isTesting} variant={'primary'} onClick={() => onStartTest()}>
            {t('config_model:start_test', { num: testModelList.length })}
          </Button>
        </>
      }
    >
      <Flex flex={'1 0 0'} h={0} minH={0} flexDirection="column" overflow="hidden">
        <FixedTableLayout
          scrollMode="normal"
          rootProps={{ flex: '1 0 0', h: 0 }}
          bodyProps={{ flex: '1 0 0', h: 0, fontSize: 'sm' }}
          renderHeader={({ headerTableWidth }) => (
            <Table
              minW="800px"
              sx={{
                tableLayout: 'fixed',
                width: `${headerTableWidth} !important`
              }}
            >
              <colgroup>
                <col />
                <col />
                <col style={{ width: '280px' }} />
                <col style={{ width: '80px' }} />
              </colgroup>
              <Thead>
                <Tr>
                  <Th>{t('config_model:model.model_id')}</Th>
                  <Th>{t('config_model:channel_configured_mapping')}</Th>
                  <Th>{t('config_model:channel_status')}</Th>
                  <Th></Th>
                </Tr>
              </Thead>
            </Table>
          )}
          renderBody={() => (
            <Table minW="800px" sx={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col />
                <col />
                <col style={{ width: '280px' }} />
                <col style={{ width: '80px' }} />
              </colgroup>
              <Tbody>
                {testModelList.map((item) => {
                  const data = statusMap[item.status];
                  return (
                    <Tr key={item.model}>
                      <Td>
                        <HStack>
                          <Avatar src={item.avatar} w={'1rem'} flexShrink={0} />
                          <Box>{item.model}</Box>
                        </HStack>
                      </Td>
                      <Td>{item.mappedModel}</Td>
                      <Td>
                        <Flex alignItems={'center'}>
                          <MyTag mr={1} type="borderSolid" colorSchema={data.colorSchema}>
                            {data.label}
                          </MyTag>
                          {item.message && <QuestionTip label={item.message} />}
                          {item.status === 'success' && item.duration !== undefined && (
                            <Box fontSize={'sm'} color={'myGray.500'}>
                              {t('config_model:request_duration', {
                                duration: item.duration.toFixed(2)
                              })}
                            </Box>
                          )}
                        </Flex>
                      </Td>
                      <Td>
                        {(!isAnyModelLoading || item.loading) && (
                          <MyIconButton
                            isLoading={item.loading}
                            icon={'core/chat/sendLight'}
                            tip={t('config_model:model.test_model')}
                            onClick={() => onTestOneModel(item.modelId)}
                          />
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
        />
      </Flex>
    </MyModal>
  );
};

export default ModelTest;
