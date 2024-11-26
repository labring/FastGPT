import { useLocalStorageState, useMemoizedFn } from 'ahooks';
import { SetStateAction, useEffect, useRef } from 'react';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { isEqual } from 'lodash';
import { getAppDiffConfig } from '@/web/core/app/diff';

export type SimpleAppSnapshotType = {
  diff?: Record<string, any>;
  title: string;
  isSaved?: boolean;
  state?: AppSimpleEditFormType;

  // old format
  appForm?: AppSimpleEditFormType;
};
export type onSaveSnapshotFnType = (props: {
  appForm: AppSimpleEditFormType; // Current edited app form data
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
        instruction: appForm1.chatConfig?.instruction || '',
        autoExecute: appForm1.chatConfig?.autoExecute || undefined
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
        instruction: appForm2.chatConfig?.instruction || '',
        autoExecute: appForm2.chatConfig?.autoExecute || undefined
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
  const [past, setPast] = useLocalStorageState<SimpleAppSnapshotType[]>(`${appId}-past`, {
    defaultValue: []
  }) as [SimpleAppSnapshotType[], (value: SetStateAction<SimpleAppSnapshotType[]>) => void];

  const saveSnapshot: onSaveSnapshotFnType = useMemoizedFn(async ({ appForm, title, isSaved }) => {
    if (forbiddenSaveSnapshot.current) {
      forbiddenSaveSnapshot.current = false;
      return false;
    }

    if (past.length === 0) {
      setPast([
        {
          title: title || formatTime2YMDHMS(new Date()),
          isSaved,
          state: appForm
        }
      ]);
      return true;
    }

    const lastPast = past[past.length - 1];
    if (!lastPast?.state) return false;

    // Get the diff between the current app form data and the initial state
    const diff = getAppDiffConfig(lastPast.state, appForm);

    // If the diff is the same as the previous snapshot, do not save
    if (past[0].diff && isEqual(past[0].diff, diff)) return false;

    setPast((past) => {
      const newPast = {
        diff,
        title: title || formatTime2YMDHMS(new Date()),
        isSaved
      };

      if (past.length >= 100) {
        return [newPast, ...past.slice(0, 98), lastPast];
      }
      return [newPast, ...past];
    });
    return true;
  });

  // remove other app's snapshot
  useEffect(() => {
    const keys = Object.keys(localStorage);
    const snapshotKeys = keys.filter(
      (key) => key.endsWith('-past') || key.endsWith('-past-simple')
    );
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
