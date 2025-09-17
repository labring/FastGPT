import { type ReactNode, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext } from 'use-context-selector';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

// 临时类型定义，后续需要根据实际API调整
type EvaluationTaskType = {
  _id: string;
  name: string;
  avatar?: string;
  createTime: string;
  updateTime: string;
  // 其他任务相关字段
};

type TaskPageContextType = {
  taskId: string;
  taskDetail: EvaluationTaskType;
  loadTaskDetail: (id: string) => Promise<EvaluationTaskType>;
};

const defaultTaskDetail: EvaluationTaskType = {
  _id: '',
  name: '',
  createTime: '',
  updateTime: ''
};

export const TaskPageContext = createContext<TaskPageContextType>({
  taskId: '',
  taskDetail: defaultTaskDetail,
  loadTaskDetail: function (id: string): Promise<EvaluationTaskType> {
    throw new Error('Function not implemented.');
  }
});

export const TaskPageContextProvider = ({
  children,
  taskId
}: {
  children: ReactNode;
  taskId: string;
}) => {
  const { t } = useTranslation();

  // task detail
  const [taskDetail, setTaskDetail] = useState(defaultTaskDetail);
  const loadTaskDetail = async (id: string) => {
    // TODO: 实现获取任务详情的API调用
    // const data = await getEvaluationTaskById(id);
    // setTaskDetail(data);
    // return data;

    // 临时返回模拟数据
    const mockData: EvaluationTaskType = {
      _id: id,
      name: '任务1',
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString()
    };
    setTaskDetail(mockData);
    return mockData;
  };

  const contextValue: TaskPageContextType = {
    taskId,
    taskDetail,
    loadTaskDetail
  };

  return <TaskPageContext.Provider value={contextValue}>{children}</TaskPageContext.Provider>;
};
