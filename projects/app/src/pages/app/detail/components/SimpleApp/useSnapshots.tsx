import { useLocalStorageState, useMemoizedFn } from 'ahooks';
import { SetStateAction, useEffect, useRef, useState } from 'react';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { isEqual } from 'lodash';
import { create } from 'jsondiffpatch';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { appWorkflow2Form } from '@fastgpt/global/core/app/utils';

const diffPatcher = create({
  objectHash: (obj: any) => obj.id || obj.nodeId || obj._id,
  propertyFilter: (name: string) => name !== 'selected'
});

export type SimpleAppSnapshotType = {
  diff?: any;
  title: string;
  isSaved?: boolean;
};
export type onSaveSnapshotFnType = (props: {
  appForm: AppSimpleEditFormType;
  title?: string;
  isSaved?: boolean;
}) => Promise<boolean>;

export const compareSimpleAppSnapshot = (
  appForm1?: AppSimpleEditFormType,
  appForm2?: AppSimpleEditFormType
) => {
  if (
    appForm1?.chatConfig &&
    appForm2?.chatConfig &&
    !isEqual(
      {
        welcomeText: appForm1.chatConfig?.welcomeText || '',
        variables: appForm1.chatConfig?.variables || [],
        questionGuide: appForm1.chatConfig?.questionGuide || false,
        ttsConfig: appForm1.chatConfig?.ttsConfig || undefined,
        whisperConfig: appForm1.chatConfig?.whisperConfig || undefined,
        scheduledTriggerConfig: appForm1.chatConfig?.scheduledTriggerConfig || undefined,
        chatInputGuide: appForm1.chatConfig?.chatInputGuide || undefined,
        fileSelectConfig: appForm1.chatConfig?.fileSelectConfig || undefined,
        instruction: appForm1.chatConfig?.instruction || ''
      },
      {
        welcomeText: appForm2.chatConfig?.welcomeText || '',
        variables: appForm2.chatConfig?.variables || [],
        questionGuide: appForm2.chatConfig?.questionGuide || false,
        ttsConfig: appForm2.chatConfig?.ttsConfig || undefined,
        whisperConfig: appForm2.chatConfig?.whisperConfig || undefined,
        scheduledTriggerConfig: appForm2.chatConfig?.scheduledTriggerConfig || undefined,
        chatInputGuide: appForm2.chatConfig?.chatInputGuide || undefined,
        fileSelectConfig: appForm2.chatConfig?.fileSelectConfig || undefined,
        instruction: appForm2.chatConfig?.instruction || ''
      }
    )
  ) {
    console.log('chatConfig not equal');
    return false;
  }

  return isEqual(appForm1, appForm2);
};

export const useSimpleAppSnapshots = (appId: string) => {
  const forbiddenSaveSnapshot = useRef(false);
  const [past, setPast] = useLocalStorageState<SimpleAppSnapshotType[]>(`${appId}-past-simple`, {
    defaultValue: []
  }) as [SimpleAppSnapshotType[], (value: SetStateAction<SimpleAppSnapshotType[]>) => void];
  const { appLatestVersion } = useContextSelector(AppContext, (v) => v);

  const saveSnapshot: onSaveSnapshotFnType = useMemoizedFn(async ({ appForm, title, isSaved }) => {
    if (forbiddenSaveSnapshot.current) {
      forbiddenSaveSnapshot.current = false;
      return false;
    }

    const initialAppForm = appWorkflow2Form({
      nodes: appLatestVersion?.nodes || [],
      chatConfig: appLatestVersion?.chatConfig || {}
    });

    if (past.length > 0) {
      const pastState = diffPatcher.patch(
        structuredClone(initialAppForm),
        past[0].diff
      ) as AppSimpleEditFormType;

      const isPastEqual = compareSimpleAppSnapshot(pastState, appForm);
      if (isPastEqual) return false;
    }

    const diff = diffPatcher.diff(structuredClone(initialAppForm), appForm);

    setPast((past) => [
      {
        diff,
        title: title || formatTime2YMDHMS(new Date()),
        isSaved
      },
      ...past.slice(0, 199)
    ]);
    return true;
  });

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

  return { forbiddenSaveSnapshot, past, setPast, saveSnapshot };
};

export default function Snapshots() {
  return <></>;
}
