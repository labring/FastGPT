import { getTestModel } from '@/web/core/ai/config';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Box,
  Flex,
  Button,
  HStack
} from '@chakra-ui/react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import React, { useEffect, useRef, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useAdminModelConfig } from '@/web/core/ai/model/useAdminModelConfig';
import { useFixedTableHeader } from '@fastgpt/web/hooks/useFixedTableHeader';

type ModelTestItem = {
  label: React.ReactNode;
  modelId: string;
  model: string;
  status: 'waiting' | 'running' | 'success' | 'error';
  message?: string;
  duration?: number;
  loading?: boolean; // 单个模型的loading状态
};

const ModelTest = ({
  channelId,
  models,
  onClose
}: {
  channelId: number;
  models: string[];
  onClose: () => void;
}) => {
  const { t, i18n } = useClientTranslation('config_model');
  const { getModelProvider, systemModelList, loading: loadingModels } = useAdminModelConfig();
  const { toast } = useToast();
  const [testModelList, setTestModelList] = useState<ModelTestItem[]>([]);

  const statusMap = useRef({
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
  });

  useEffect(() => {
    const list = models.flatMap((model) => {
      const modelData = systemModelList.find((item) => item.model === model);
      if (!modelData) return [];
      const provider = getModelProvider(modelData.provider, i18n.language);

      return [
        {
          label: (
            <HStack>
              <MyIcon name={provider.avatar as any} w={'1rem'} />
              <Box>{t(modelData.name as any)}</Box>
            </HStack>
          ),
          modelId: modelData.modelId,
          model: modelData.model,
          status: 'waiting' as const,
          loading: false
        }
      ];
    });
    setTestModelList(list);
  }, [getModelProvider, i18n.language, models, systemModelList, t]);

  const { runAsync: onStartTest, loading: isAnyModelLoading } = useRequest(
    async () => {
      let errorNum = 0;
      setTestModelList((prev) => prev.map((item) => ({ ...item, loading: true })));

      const testModel = async (modelId: string) => {
        setTestModelList((prev) =>
          prev.map((item) =>
            item.modelId === modelId ? { ...item, status: 'running', message: '' } : item
          )
        );
        const start = Date.now();
        try {
          await getTestModel({ modelId, channelId });
          const duration = Date.now() - start;
          setTestModelList((prev) =>
            prev.map((item) =>
              item.modelId === modelId
                ? { ...item, status: 'success', duration: duration / 1000, loading: false }
                : item
            )
          );
        } catch (error) {
          setTestModelList((prev) =>
            prev.map((item) =>
              item.modelId === modelId
                ? { ...item, status: 'error', message: getErrText(error), loading: false }
                : item
            )
          );
          errorNum++;
        }
      };

      await batchRun(
        testModelList.map((item) => item.modelId),
        testModel,
        5
      );

      if (errorNum > 0) {
        toast({
          status: 'warning',
          title: t('config_model:test_failed', { num: errorNum })
        });
      }
    },
    {
      refreshDeps: [testModelList]
    }
  );

  const { runAsync: onTestOneModel, loading: testingOneModel } = useRequest(
    async (modelId: string) => {
      const start = Date.now();

      setTestModelList((prev) =>
        prev.map((item) =>
          item.modelId === modelId
            ? { ...item, status: 'running', message: '', loading: true }
            : item
        )
      );

      try {
        await getTestModel({ modelId, channelId });
        const duration = Date.now() - start;

        setTestModelList((prev) =>
          prev.map((item) =>
            item.modelId === modelId
              ? { ...item, status: 'success', duration: duration / 1000, loading: false }
              : item
          )
        );
      } catch (error) {
        setTestModelList((prev) =>
          prev.map((item) =>
            item.modelId === modelId
              ? { ...item, status: 'error', message: getErrText(error), loading: false }
              : item
          )
        );
      }
    },
    {
      manual: true
    }
  );

  const isTesting = isAnyModelLoading || testingOneModel;
  const { headerContainerRef, bodyContainerRef, headerTableWidth } = useFixedTableHeader();

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
          <Button isLoading={isTesting} variant={'primary'} onClick={onStartTest}>
            {t('config_model:start_test', { num: testModelList.length })}
          </Button>
        </>
      }
    >
      <Flex flex={'1 0 0'} h={0} minH={0} flexDirection="column" overflow="hidden">
        <TableContainer ref={headerContainerRef} flexShrink={0} overflowX="hidden">
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
                <Th>{t('config_model:model_name')}</Th>
                <Th>{t('config_model:model.model_id')}</Th>
                <Th>{t('config_model:channel_status')}</Th>
                <Th></Th>
              </Tr>
            </Thead>
          </Table>
        </TableContainer>
        <TableContainer
          ref={bodyContainerRef}
          flex={'1 0 0'}
          h={0}
          minH={0}
          overflowY={'auto'}
          fontSize={'sm'}
        >
          <Table minW="800px" sx={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col />
              <col />
              <col style={{ width: '280px' }} />
              <col style={{ width: '80px' }} />
            </colgroup>
            <Tbody>
              {testModelList.map((item) => {
                const data = statusMap.current[item.status];
                return (
                  <Tr key={item.model}>
                    <Td>{item.label}</Td>
                    <Td>{item.model}</Td>
                    <Td>
                      <Flex alignItems={'center'}>
                        <MyTag mr={1} type="borderSolid" colorSchema={data.colorSchema as any}>
                          {data.label}
                        </MyTag>
                        {item.message && <QuestionTip label={item.message} />}
                        {item.status === 'success' && item.duration && (
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
        </TableContainer>
      </Flex>
    </MyModal>
  );
};

export default ModelTest;
