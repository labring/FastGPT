import { useLocalStorageState, useMemoizedFn } from 'ahooks';
import { SetStateAction, useEffect, useRef } from 'react';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { isEqual } from 'lodash';

export type SimpleAppSnapshotType = {
  appForm: AppSimpleEditFormType;
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

  const saveSnapshot: onSaveSnapshotFnType = useMemoizedFn(async ({ appForm, title, isSaved }) => {
    if (forbiddenSaveSnapshot.current) {
      forbiddenSaveSnapshot.current = false;
      return false;
    }

    const pastState = past[0];

    const isPastEqual = compareSimpleAppSnapshot(pastState?.appForm, appForm);
    if (isPastEqual) return false;

    setPast((past) => [
      {
        appForm,
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
