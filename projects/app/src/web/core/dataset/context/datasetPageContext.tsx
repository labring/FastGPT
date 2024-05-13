import { useQuery } from '@tanstack/react-query';
import { ReactNode, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext } from 'use-context-selector';
import { getDatasetTrainingQueue, getTrainingQueueLen } from '../api';
import { useDatasetStore } from '../store/dataset';

type DatasetPageContextType = {
  vectorTrainingMap: {
    colorSchema: string;
    tip: string;
  };
  agentTrainingMap: {
    colorSchema: string;
    tip: string;
  };
  rebuildingCount: number;
  trainingCount: number;
  refetchDatasetTraining: () => void;
};

type DatasetPageContextValueType = {
  datasetId: string;
};

export const DatasetPageContext = createContext<DatasetPageContextType>({
  vectorTrainingMap: {
    colorSchema: '',
    tip: ''
  },
  agentTrainingMap: {
    colorSchema: '',
    tip: ''
  },
  rebuildingCount: 0,
  trainingCount: 0,
  refetchDatasetTraining: function (): void {
    throw new Error('Function not implemented.');
  }
});

export const DatasetPageContextProvider = ({
  children,
  value
}: {
  children: ReactNode;
  value: DatasetPageContextValueType;
}) => {
  const { t } = useTranslation();
  const { datasetId } = value;
  const { datasetDetail } = useDatasetStore();

  // global queue
  const { data: { vectorTrainingCount = 0, agentTrainingCount = 0 } = {} } = useQuery(
    ['getTrainingQueueLen'],
    () =>
      getTrainingQueueLen({
        vectorModel: datasetDetail.vectorModel.model,
        agentModel: datasetDetail.agentModel.model
      }),
    {
      refetchInterval: 10000
    }
  );
  const { vectorTrainingMap, agentTrainingMap } = useMemo(() => {
    const vectorTrainingMap = (() => {
      if (vectorTrainingCount < 1000)
        return {
          colorSchema: 'green',
          tip: t('core.dataset.training.Leisure')
        };
      if (vectorTrainingCount < 10000)
        return {
          colorSchema: 'yellow',
          tip: t('core.dataset.training.Waiting')
        };
      return {
        colorSchema: 'red',
        tip: t('core.dataset.training.Full')
      };
    })();
    const agentTrainingMap = (() => {
      if (agentTrainingCount < 100)
        return {
          colorSchema: 'green',
          tip: t('core.dataset.training.Leisure')
        };
      if (agentTrainingCount < 1000)
        return {
          colorSchema: 'yellow',
          tip: t('core.dataset.training.Waiting')
        };
      return {
        colorSchema: 'red',
        tip: t('core.dataset.training.Full')
      };
    })();
    return {
      vectorTrainingMap,
      agentTrainingMap
    };
  }, [agentTrainingCount, t, vectorTrainingCount]);

  // training and rebuild queue
  const { data: { rebuildingCount = 0, trainingCount = 0 } = {}, refetch: refetchDatasetTraining } =
    useQuery(['getDatasetTrainingQueue'], () => getDatasetTrainingQueue(datasetId), {
      refetchInterval: 10000
    });

  const contextValue: DatasetPageContextType = {
    vectorTrainingMap,
    agentTrainingMap,
    rebuildingCount,
    trainingCount,
    refetchDatasetTraining
  };

  return <DatasetPageContext.Provider value={contextValue}>{children}</DatasetPageContext.Provider>;
};
