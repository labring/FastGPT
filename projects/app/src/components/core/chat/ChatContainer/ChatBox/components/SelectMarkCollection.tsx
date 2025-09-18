import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ModalBody, ModalFooter, Button, VStack, FormControl, FormLabel } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import MyModal from '@fastgpt/web/components/common/MyModal';
import dynamic from 'next/dynamic';
import { type AdminFbkType } from '@fastgpt/global/core/chat/type.d';
import FilesCascader from './FilesCascader';
import type { FileSelection } from './FilesCascader';
import EvaluationDatasetSelector from './EvaluationDatasetSelector';
import { getEvaluationList } from '@/web/core/evaluation/task';

const InputDataModal = dynamic(() => import('@/pageComponents/dataset/detail/InputDataModal'));

export type AdminMarkType = {
  feedbackDataId?: string;
  datasetId?: string;
  datasetName?: string;
  datasetAvatar?: string;
  collectionId?: string;
  collectionName?: string;
  collectionType?: string;
  noKnowledgeBase?: boolean;
  q: string;
  a?: string;
};

const SelectMarkCollection = ({
  adminMarkData,
  setAdminMarkData,
  onSuccess,
  onClose
}: {
  adminMarkData: AdminMarkType;
  setAdminMarkData: (e: AdminMarkType) => void;
  onClose: () => void;
  onSuccess: (adminFeedback: AdminFbkType) => void;
}) => {
  const { t } = useTranslation();
  const router = useRouter();

  // 从路由查询参数获取appId
  const appId = useMemo(() => {
    return router.query.appId as string;
  }, [router.query.appId]);

  // 级联选择器的值
  const cascaderValue: FileSelection = useMemo(() => {
    return {
      datasetId: adminMarkData.datasetId,
      datasetName: adminMarkData.datasetName,
      datasetAvatar: adminMarkData.datasetAvatar,
      collectionId: adminMarkData.collectionId,
      collectionName: adminMarkData.collectionName,
      collectionType: adminMarkData.collectionType,
      noKnowledgeBase: adminMarkData.noKnowledgeBase
    };
  }, [adminMarkData]);

  // 处理级联选择器变化
  const handleCascaderChange = useCallback(
    (selection: FileSelection) => {
      setAdminMarkData({
        ...adminMarkData,
        ...selection
      });
    },
    [adminMarkData, setAdminMarkData]
  );

  // 评测数据集选择相关
  const [selectedEvaluationDataset, setSelectedEvaluationDataset] = useState<string>('');

  // 处理评测数据集选择变化
  const handleEvaluationDatasetChange = useCallback((datasetId: string) => {
    setSelectedEvaluationDataset(datasetId);
  }, []);

  // 处理确认按钮点击
  const handleConfirm = useCallback(() => {
    if (
      (adminMarkData.datasetId && adminMarkData.collectionId) ||
      (selectedEvaluationDataset && selectedEvaluationDataset !== 'null')
    ) {
      // 打开输入数据模态框
      setShowInputDataModal(true);
    }
  }, [adminMarkData.datasetId, adminMarkData.collectionId, selectedEvaluationDataset]);

  // 控制是否显示输入数据模态框
  const [showInputDataModal, setShowInputDataModal] = useState(false);

  // 检查是否可以选择（需要同时选择了数据集和集合，且不是"不加入知识库"）
  const canConfirm =
    (adminMarkData.datasetId && adminMarkData.collectionId && !adminMarkData.noKnowledgeBase) ||
    (selectedEvaluationDataset !== 'null' && selectedEvaluationDataset);

  useEffect(() => {
    getEvaluationList({
      pageNum: 1,
      pageSize: 1,
      appId: appId
    }).then((res) => {
      const item = res?.list?.[0];
      if (item) {
        setSelectedEvaluationDataset(item.evalDatasetCollectionId);
      }
    });
  }, [appId]);

  return (
    <>
      {/* select dataset */}
      <MyModal
        isOpen={!showInputDataModal}
        onClose={onClose}
        iconSrc="kbTest"
        iconColor={'primary.600'}
        title={t('app:select_join_location')}
        w={'600px'}
        h={'400px'}
      >
        <ModalBody flex={'1 0 0'} overflowY={'auto'} p={6}>
          <VStack spacing={4} align="stretch">
            <EvaluationDatasetSelector
              value={selectedEvaluationDataset}
              onChange={handleEvaluationDatasetChange}
            />
            <FormControl>
              <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
                {t('dashboard_evaluation:join_knowledge_base')}
              </FormLabel>
              <FilesCascader value={cascaderValue} onChange={handleCascaderChange} />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant={'whiteBase'} mr={2} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button onClick={handleConfirm} isDisabled={!canConfirm}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>

      {/* input data */}
      {showInputDataModal && (
        <InputDataModal
          onClose={() => {
            setShowInputDataModal(false);
          }}
          collectionId={adminMarkData.collectionId || ''}
          evaluationDatasetId={
            selectedEvaluationDataset === 'null' ? '' : selectedEvaluationDataset
          }
          dataId={adminMarkData.feedbackDataId}
          defaultValue={{
            q: adminMarkData.q,
            a: adminMarkData.a
          }}
          onSuccess={(data) => {
            if (
              !data.q ||
              !adminMarkData.datasetId ||
              !adminMarkData.collectionId ||
              !data.dataId
            ) {
              return onClose();
            }

            onSuccess({
              feedbackDataId: data.dataId,
              datasetId: adminMarkData.datasetId,
              collectionId: adminMarkData.collectionId,
              q: data.q,
              a: data.a
            });
            onClose();
          }}
        />
      )}
    </>
  );
};

export default React.memo(SelectMarkCollection);
