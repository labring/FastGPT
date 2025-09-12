import React, { useState, useMemo, useCallback } from 'react';
import { ModalBody, ModalFooter, Button, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import dynamic from 'next/dynamic';
import { type AdminFbkType } from '@fastgpt/global/core/chat/type.d';
import FilesCascader from './FilesCascader';
import type { FileSelection } from './FilesCascader';

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

  // 处理确认按钮点击
  const handleConfirm = useCallback(() => {
    if (adminMarkData.datasetId && adminMarkData.collectionId) {
      // 打开输入数据模态框
      setShowInputDataModal(true);
    }
  }, [adminMarkData.datasetId, adminMarkData.collectionId]);

  // 控制是否显示输入数据模态框
  const [showInputDataModal, setShowInputDataModal] = useState(false);

  // 检查是否可以选择（需要同时选择了数据集和集合，且不是"不加入知识库"）
  const canConfirm =
    adminMarkData.datasetId && adminMarkData.collectionId && !adminMarkData.noKnowledgeBase;

  return (
    <>
      {/* select dataset */}
      <MyModal
        isOpen={!showInputDataModal}
        onClose={onClose}
        title={t('app:select_join_location')}
        w={'600px'}
        h={'400px'}
      >
        <ModalBody flex={'1 0 0'} overflowY={'auto'} p={6}>
          <Box mb={4}>
            <FilesCascader value={cascaderValue} onChange={handleCascaderChange} />
          </Box>
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
