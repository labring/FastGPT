import React, { createContext, useContext, useState } from 'react';
import { useDisclosure } from '@chakra-ui/react';
import type { EvaluationStatus } from './const';
import { type IntelligentGenerationForm } from '../IntelligentGeneration';

// 数据类型定义
interface EvaluationDataItem {
  _id: string;
  index: number;
  question: string;
  answer: string;
  status: EvaluationStatus;
}

interface DataListContextType {
  // 数据相关
  evaluationDataList: EvaluationDataItem[];
  setEvaluationDataList: React.Dispatch<React.SetStateAction<EvaluationDataItem[]>>;

  // 编辑数据弹窗相关
  isEditModalOpen: boolean;
  onEditModalOpen: () => void;
  onEditModalClose: () => void;
  selectedItem: EvaluationDataItem | null;
  setSelectedItem: (item: EvaluationDataItem | null) => void;

  // 质量评估弹窗相关
  isQualityEvaluationModalOpen: boolean;
  onQualityEvaluationModalOpen: () => void;
  onQualityEvaluationModalClose: () => void;

  // 智能生成弹窗相关
  isIntelligentGenerationModalOpen: boolean;
  onIntelligentGenerationModalOpen: () => void;
  onIntelligentGenerationModalClose: () => void;

  // 设置弹窗相关
  isSettingsModalOpen: boolean;
  onSettingsModalOpen: () => void;
  onSettingsModalClose: () => void;
  evaluationModel: string;
  setEvaluationModel: (value: string) => void;

  // 删除确认相关
  deleteConfirmItem: string | null;
  setDeleteConfirmItem: (itemId: string | null) => void;

  // 业务逻辑处理函数
  handleSaveData: (data: { question: string; referenceAnswer: string }) => void;
  handleSaveAndNext: (data: { question: string; referenceAnswer: string }) => void;
  handleQualityEvaluationConfirm: () => void;
  handleIntelligentGenerationConfirm: (data: IntelligentGenerationForm) => void;
  handleSettingsConfirm: () => void;
  handleDeleteConfirm: (itemId: string) => void;
}

const DataListContext = createContext<DataListContextType | undefined>(undefined);

interface DataListProviderProps {
  children: React.ReactNode;
}

export const DataListProvider: React.FC<DataListProviderProps> = ({ children }) => {
  const [evaluationDataList, setEvaluationDataList] = useState<EvaluationDataItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<EvaluationDataItem | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<string | null>(null);
  const [evaluationModel, setEvaluationModel] = useState<string>('DeepSeek-R1-Distill-Qwen-32B');

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

  // 业务逻辑处理函数
  const handleSaveData = (data: { question: string; referenceAnswer: string }) => {
    // 这里可以添加保存数据的API调用
    onEditModalClose();
  };

  const handleSaveAndNext = (data: { question: string; referenceAnswer: string }) => {
    // 这里可以添加保存数据的API调用
    // 然后自动打开下一条数据
    const currentIndex = evaluationDataList.findIndex((item) => item._id === selectedItem?._id);
    if (currentIndex < evaluationDataList.length - 1) {
      const nextItem = evaluationDataList[currentIndex + 1];
      setSelectedItem(nextItem);
    } else {
      onEditModalClose();
    }
  };

  const handleQualityEvaluationConfirm = () => {
    // 这里可以添加质量评估的API调用
    console.log('开始质量评估');
    onQualityEvaluationModalClose();
  };

  const handleIntelligentGenerationConfirm = (data: IntelligentGenerationForm) => {
    // 这里可以添加智能生成数据的API调用
    console.log('智能生成数据:', data);
    onIntelligentGenerationModalClose();
  };

  const handleSettingsConfirm = () => {
    // 这里可以添加保存设置的API调用
    console.log('保存评测模型设置:', evaluationModel);
    onSettingsModalClose();
  };

  const handleDeleteConfirm = (itemId: string) => {
    // 这里可以添加删除API调用
    // 删除成功后更新列表
    setEvaluationDataList((prev) => prev.filter((item) => item._id !== itemId));
    setDeleteConfirmItem(null);
  };

  const contextValue: DataListContextType = {
    // 数据相关
    evaluationDataList,
    setEvaluationDataList,

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
    evaluationModel,
    setEvaluationModel,

    // 删除确认相关
    deleteConfirmItem,
    setDeleteConfirmItem,

    // 业务逻辑处理函数
    handleSaveData,
    handleSaveAndNext,
    handleQualityEvaluationConfirm,
    handleIntelligentGenerationConfirm,
    handleSettingsConfirm,
    handleDeleteConfirm
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

export type { EvaluationDataItem };
