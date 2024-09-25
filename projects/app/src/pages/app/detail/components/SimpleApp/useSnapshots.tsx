import { useLocalStorageState, useMemoizedFn } from 'ahooks';
import { SaveSnapshotParams, SnapshotsType } from '../WorkflowComponents/context';
import { SetStateAction, useEffect } from 'react';
import { compareSnapshot } from '@/web/core/workflow/utils';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { Node } from 'reactflow';

export type SaveSnapshotFnType = (
  props: SaveSnapshotParams & {
    isSaved?: boolean;
  }
) => Promise<boolean>;

const useSnapshots = (appId: string) => {
  const [past, setPast] = useLocalStorageState<SnapshotsType[]>(`${appId}-past-simple`, {
    defaultValue: [],
    listenStorageChange: true
  }) as [SnapshotsType[], (value: SetStateAction<SnapshotsType[]>) => void];

  const saveSnapshot: SaveSnapshotFnType = useMemoizedFn(
    async ({ pastNodes, chatConfig, customTitle, isSaved }) => {
      if (!pastNodes) return false;

      const pastState = past[0];

      const isPastEqual = compareSnapshot(
        {
          nodes: pastNodes,
          edges: [],
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
          edges: [],
          title: customTitle || formatTime2YMDHMS(new Date()),
          chatConfig,
          isSaved
        },
        ...past.slice(0, 199)
      ]);
      return true;
    }
  );

  // remove other app's snapshot
  useEffect(() => {
    const keys = Object.keys(localStorage);
    const snapshotKeys = keys.filter((key) => key.endsWith('-past-simple'));
    snapshotKeys.forEach((key) => {
      const keyAppId = key.split('-')[0];
      if (keyAppId !== appId) {
        localStorage.removeItem(key);
      }
    });
  }, [appId]);

  return { past, setPast, saveSnapshot };
};

export default useSnapshots;
