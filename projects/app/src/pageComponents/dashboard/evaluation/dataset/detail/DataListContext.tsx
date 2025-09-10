import React, { createContext, useContext, useState } from 'react';
import { useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import type { listEvalDatasetDataResponse } from '@fastgpt/global/core/evaluation/dataset/api';

export interface ManualAddDataFormData {
  question: string;
  referenceAnswer: string;
  autoEvaluate: boolean;
  evaluationModel: string;
}

interface DataListContextType {
  // 数据相关
  evaluationDataList: listEvalDatasetDataResponse[];
  setEvaluationDataList: React.Dispatch<React.SetStateAction<listEvalDatasetDataResponse[]>>;
  collectionId: string;
  collectionName: string;

  // 编辑数据弹窗相关
  isEditModalOpen: boolean;
  onEditModalOpen: () => void;
  onEditModalClose: () => void;
  selectedItem: listEvalDatasetDataResponse | null;
  setSelectedItem: (item: listEvalDatasetDataResponse | null) => void;

  // 质量评估弹窗相关
  isQualityEvaluationModalOpen: boolean;
  onQualityEvaluationModalOpen: () => void;
  onQualityEvaluationModalClose: () => void;

  // 智能生成弹窗相关
  isIntelligentGenerationModalOpen: boolean;
  onIntelligentGenerationModalOpen: () => void;
  onIntelligentGenerationModalClose: () => void;

  // 手动新增数据弹窗相关
  isManualAddModalOpen: boolean;
  onManualAddModalOpen: () => void;
  onManualAddModalClose: () => void;

  // 设置弹窗相关
  isSettingsModalOpen: boolean;
  onSettingsModalOpen: () => void;
  onSettingsModalClose: () => void;

  // 删除确认相关
  deleteConfirmItem: string | null;
  setDeleteConfirmItem: (itemId: string | null) => void;
}

const DataListContext = createContext<DataListContextType | undefined>(undefined);

interface DataListProviderProps {
  children: React.ReactNode;
  collectionId: string;
}

export const DataListProvider: React.FC<DataListProviderProps> = ({ children, collectionId }) => {
  const { t } = useTranslation();
  const router = useRouter();

  // 从URL查询参数中获取collectionName
  const collectionName = (router.query.collectionName as string) || '';

  const [evaluationDataList, setEvaluationDataList] = useState<listEvalDatasetDataResponse[]>([]);
  const [selectedItem, setSelectedItem] = useState<listEvalDatasetDataResponse | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<string | null>(null);

  const {
    isOpen: isEditModalOpen,
    onOpen: onEditModalOpen,
    onClose: onEditModalClose
  } = useDisclosure();

  const {
    isOpen: isQualityEvaluationModalOpen,
    onOpen: onQualityEvaluationModalOpen,
    onClose: onQualityEvaluationModalClose
  } = useDisclosure();

  const {
    isOpen: isIntelligentGenerationModalOpen,
    onOpen: onIntelligentGenerationModalOpen,
    onClose: onIntelligentGenerationModalClose
  } = useDisclosure();

  const {
    isOpen: isSettingsModalOpen,
    onOpen: onSettingsModalOpen,
    onClose: onSettingsModalClose
  } = useDisclosure();

  // 手动新增数据弹窗
  const {
    isOpen: isManualAddModalOpen,
    onOpen: onManualAddModalOpen,
    onClose: onManualAddModalClose
  } = useDisclosure();

  const contextValue: DataListContextType = {
    // 数据相关
    evaluationDataList,
    setEvaluationDataList,
    collectionId,
    collectionName,
    // 编辑数据弹窗相关
    isEditModalOpen,
    onEditModalOpen,
    onEditModalClose,
    selectedItem,
    setSelectedItem,

    // 质量评估弹窗相关
    isQualityEvaluationModalOpen,
    onQualityEvaluationModalOpen,
    onQualityEvaluationModalClose,

    // 智能生成弹窗相关
    isIntelligentGenerationModalOpen,
    onIntelligentGenerationModalOpen,
    onIntelligentGenerationModalClose,

    // 设置弹窗相关
    isSettingsModalOpen,
    onSettingsModalOpen,
    onSettingsModalClose,

    // 手动新增数据弹窗相关
    isManualAddModalOpen,
    onManualAddModalOpen,
    onManualAddModalClose,

    // 删除确认相关
    deleteConfirmItem,
    setDeleteConfirmItem
  };

  return <DataListContext.Provider value={contextValue}>{children}</DataListContext.Provider>;
};

export const useDataListContext = () => {
  const context = useContext(DataListContext);
  if (context === undefined) {
    throw new Error('useDataListContext must be used within a DataListProvider');
  }
  return context;
};

export type { listEvalDatasetDataResponse };
