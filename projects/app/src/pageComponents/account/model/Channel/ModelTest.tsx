import { getSystemModelList, getTestModel } from '@/web/core/ai/config';
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
  HStack,
  ModalBody,
  ModalFooter
} from '@chakra-ui/react';
import { getModelProvider } from '@fastgpt/global/core/ai/provider';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import React, { useRef, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';

type ModelTestItem = {
  label: React.ReactNode;
  model: string;
  status: 'waiting' | 'running' | 'success' | 'error';
  message?: string;
  duration?: number;
};

const ModelTest = ({ models, onClose }: { models: string[]; onClose: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [testModelList, setTestModelList] = useState<ModelTestItem[]>([]);

  const statusMap = useRef({
    waiting: {
      label: t('account_model:waiting_test'),
      colorSchema: 'gray'
    },
    running: {
      label: t('account_model:running_test'),
      colorSchema: 'blue'
    },
    success: {
      label: t('common:common.Success'),
      colorSchema: 'green'
    },
    error: {
      label: t('common:common.failed'),
      colorSchema: 'red'
    }
  });
  const { loading: loadingModels } = useRequest2(getSystemModelList, {
    manual: false,
    refreshDeps: [models],
    onSuccess(res) {
      const list = models
        .map((model) => {
          const modelData = res.find((item) => item.model === model);
          if (!modelData) return null;
          const provider = getModelProvider(modelData.provider);

          return {
            label: (
              <HStack>
                <MyIcon name={provider.avatar as any} w={'1rem'} />
                <Box>{t(modelData.name as any)}</Box>
              </HStack>
            ),
            model: modelData.model,
            status: 'waiting'
          };
        })
        .filter(Boolean) as ModelTestItem[];
      setTestModelList(list);
    }
  });

  const { runAsync: onStartTest, loading: isTesting } = useRequest2(
    async () => {
      {
        let errorNum = 0;
        const testModel = async (model: string) => {
          setTestModelList((prev) =>
            prev.map((item) =>
              item.model === model ? { ...item, status: 'running', message: '' } : item
            )
          );
          const start = Date.now();
          try {
            await getTestModel(model);
            const duration = Date.now() - start;
            setTestModelList((prev) =>
              prev.map((item) =>
                item.model === model
                  ? { ...item, status: 'success', duration: duration / 1000 }
                  : item
              )
            );
          } catch (error) {
            setTestModelList((prev) =>
              prev.map((item) =>
                item.model === model
                  ? { ...item, status: 'error', message: getErrText(error) }
                  : item
              )
            );
            errorNum++;
          }
        };

        await batchRun(
          testModelList.map((item) => item.model),
          testModel,
          5
        );

        if (errorNum > 0) {
          toast({
            status: 'warning',
            title: t('account_model:test_failed', { num: errorNum })
          });
        }
      }
    },
    {
      refreshDeps: [testModelList]
    }
  );

  return (
    <MyModal
      iconSrc={'core/chat/sendLight'}
      isLoading={loadingModels}
      title={t('account_model:model_test')}
      w={'600px'}
      isOpen
    >
      <ModalBody>
        <TableContainer h={'100%'} overflowY={'auto'} fontSize={'sm'} maxH={'60vh'}>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('account_model:model')}</Th>
                <Th>{t('account_model:channel_status')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {testModelList.map((item) => {
                const data = statusMap.current[item.status];
                return (
                  <Tr key={item.model}>
                    <Td>{item.label}</Td>
                    <Td>
                      <Flex alignItems={'center'}>
                        <MyTag mr={1} type="borderSolid" colorSchema={data.colorSchema as any}>
                          {data.label}
                        </MyTag>
                        {item.message && <QuestionTip label={item.message} />}
                        {item.status === 'success' && item.duration && (
                          <Box fontSize={'sm'} color={'myGray.500'}>
                            {t('account_model:request_duration', {
                              duration: item.duration.toFixed(2)
                            })}
                          </Box>
                        )}
                      </Flex>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableContainer>
      </ModalBody>
      <ModalFooter>
        <Button mr={4} variant={'whiteBase'} onClick={onClose}>
          {t('common:common.Cancel')}
        </Button>
        <Button isLoading={isTesting} variant={'primary'} onClick={onStartTest}>
          {t('account_model:start_test', { num: testModelList.length })}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ModelTest;
