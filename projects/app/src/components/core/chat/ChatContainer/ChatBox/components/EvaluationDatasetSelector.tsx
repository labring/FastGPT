import React, { useState, useMemo, useCallback } from 'react';
import { Button, Box, Text, HStack, Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import dynamic from 'next/dynamic';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getEvaluationDatasetList } from '@/web/core/evaluation/dataset';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const IntelligentGeneration = dynamic(
  () => import('@/pageComponents/dashboard/evaluation/dataset/IntelligentGeneration')
);

interface EvaluationDatasetSelectorProps {
  value: string;
  onChange: (datasetId: string) => void;
}

const EvaluationDatasetSelector: React.FC<EvaluationDatasetSelectorProps> = ({
  value,
  onChange
}) => {
  const { t } = useTranslation();

  // 智能生成数据集弹窗控制
  const {
    isOpen: isIntelligentModalOpen,
    onOpen: onOpenIntelligentModal,
    onClose: onCloseIntelligentModal
  } = useDisclosure();

  // 获取评测数据集列表
  const scrollParams = useMemo(
    () => ({
      searchKey: '',
      pageSize: 10
    }),
    []
  );

  const EmptyTipDom = useMemo(() => <EmptyTip text={t('dashboard_evaluation:no_data')} />, [t]);

  const {
    data: evaluationDatasetList,
    ScrollData,
    isLoading: isLoadingDatasets,
    refreshList: fetchDatasets
  } = useScrollPagination(getEvaluationDatasetList, {
    params: scrollParams,
    refreshDeps: [],
    EmptyTip: EmptyTipDom
  });

  // 转换评测数据集列表为 MySelect 需要的格式
  const evaluationDatasetSelectList = useMemo(() => {
    const data = evaluationDatasetList.map((item) => ({
      label: item.name,
      value: item._id
    }));

    return [{ label: t('dashboard_evaluation:not_join_evaluation_dataset'), value: 'null' }].concat(
      data
    );
  }, [evaluationDatasetList, t]);

  // 处理创建数据集
  const handleCreateDataset = useCallback(
    (type: 'smart' | 'import') => {
      if (type === 'smart') {
        onOpenIntelligentModal();
      } else {
        // 在新标签页打开文件导入页面
        window.open(
          '/dashboard/evaluation/dataset/fileImport?scene=evaluationDatasetList',
          '_blank'
        );
      }
    },
    [onOpenIntelligentModal]
  );

  // 智能生成数据集确认回调
  const handleIntelligentGenerationConfirm = useCallback(
    (data: any, datasetId?: string) => {
      onCloseIntelligentModal();
      fetchDatasets();
    },
    [onCloseIntelligentModal, fetchDatasets]
  );

  return (
    <>
      <Flex flexDirection={'column'}>
        <HStack spacing={2} mb={2}>
          <Box flex={1}>
            <Text fontSize="14px" fontWeight="medium" color="myGray.900">
              {t('dashboard_evaluation:join_evaluation_dataset')}
            </Text>
          </Box>
          <MyMenu
            offset={[0, 5]}
            Button={
              <Button variant="whiteBase" size="md" flexShrink={0}>
                {t('dashboard_evaluation:create_new_dataset_btn_text')}
              </Button>
            }
            menuList={[
              {
                children: [
                  {
                    label: (
                      <Flex>
                        <MyIcon name={'core/app/aiLightSmall'} w={'16px'} mr={2} />
                        {t('dashboard_evaluation:smart_generation')}
                      </Flex>
                    ),
                    onClick: () => handleCreateDataset('smart')
                  },
                  {
                    label: (
                      <Flex>
                        <MyIcon name={'core/dataset/tableCollection'} mr={2} w={'16px'} />
                        {t('dashboard_evaluation:file_import')}
                      </Flex>
                    ),
                    onClick: () => handleCreateDataset('import')
                  }
                ]
              }
            ]}
          />
        </HStack>
        <MySelect
          value={value}
          placeholder={t('dashboard_evaluation:please_select_evaluation_dataset')}
          list={evaluationDatasetSelectList}
          isLoading={isLoadingDatasets}
          onChange={onChange}
          ScrollData={ScrollData}
          bg="myGray.50"
        />
      </Flex>

      {/* 智能生成数据集弹窗 */}
      {isIntelligentModalOpen && (
        <IntelligentGeneration
          isOpen={isIntelligentModalOpen}
          onClose={onCloseIntelligentModal}
          onConfirm={handleIntelligentGenerationConfirm}
          returnDatasetId={true}
        />
      )}
    </>
  );
};

export default React.memo(EvaluationDatasetSelector);
