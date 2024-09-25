import { useLocalStorageState, useMemoizedFn } from 'ahooks';
import { SaveSnapshotParams } from '../WorkflowComponents/context';
import { SetStateAction, useEffect } from 'react';
import { compareAppForm, compareSnapshot } from '@/web/core/workflow/utils';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';

export type SaveSnapshotFnType = (props: {
  appForm: AppSimpleEditFormType;
  customTitle?: string;
  isSaved?: boolean;
}) => Promise<boolean>;

export type PastFormType = {
  appForm: AppSimpleEditFormType;
  title?: string;
  isSaved?: boolean;
};

const useSnapshots = (appId: string) => {
  const [pastForm, setPastForm] = useLocalStorageState<PastFormType[]>(`${appId}-past-simple`, {
    defaultValue: [],
    listenStorageChange: true
  }) as [PastFormType[], (value: SetStateAction<PastFormType[]>) => void];

  const saveSnapshot: SaveSnapshotFnType = useMemoizedFn(
    async ({ appForm, customTitle, isSaved }) => {
      const pastState = pastForm[0];

      const isPastEqual = compareAppForm(appForm, pastState?.appForm);
      if (isPastEqual) return false;

      setPastForm((past) => [
        {
          appForm,
          title: customTitle || formatTime2YMDHMS(new Date()),
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

  return { pastForm, setPastForm, saveSnapshot };
};

export default useSnapshots;
