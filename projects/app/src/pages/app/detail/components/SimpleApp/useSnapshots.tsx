import { useLocalStorageState, useMemoizedFn } from 'ahooks';
import { SnapshotsType } from '../WorkflowComponents/context';
import { SetStateAction } from 'react';
import { compareSnapshot } from '@/web/core/workflow/utils';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';

const useSnapshots = (appId: string) => {
  const [past, setPast] = useLocalStorageState<SnapshotsType[]>(`${appId}-past-simple`, {
    defaultValue: [],
    listenStorageChange: true
  }) as [SnapshotsType[], (value: SetStateAction<SnapshotsType[]>) => void];

  const saveSnapshot = useMemoizedFn(
    async ({ pastNodes, pastEdges, chatConfig, customTitle, isSaved }) => {
      const pastState = past[0];
      const isPastEqual = compareSnapshot(
        {
          nodes: pastNodes,
          edges: pastEdges,
          chatConfig: chatConfig
        },
        {
          nodes: pastState?.nodes,
          edges: pastState?.edges,
          chatConfig: pastState?.chatConfig
        }
      );
      if (isPastEqual) return false;

      setPast((past) => [
        {
          nodes: pastNodes,
          edges: pastEdges,
          title: customTitle || formatTime2YMDHMS(new Date()),
          chatConfig,
          isSaved
        },
        ...past.slice(0, 199)
      ]);
      return true;
    }
  );

  return { past, setPast, saveSnapshot };
};

export default useSnapshots;
