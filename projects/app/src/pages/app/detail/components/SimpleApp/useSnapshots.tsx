import { useMemoizedFn } from 'ahooks';
import { useRef, useState } from 'react';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { isEqual } from 'lodash';

export type SimpleAppSnapshotType = {
  title: string;
  isSaved?: boolean;
  appForm: AppSimpleEditFormType;

  // abandon
  state?: AppSimpleEditFormType;
  diff?: Record<string, any>;
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
        chatInputGuide: appForm1.chatConfig?.chatInputGuide || undefined,
        fileSelectConfig: appForm1.chatConfig?.fileSelectConfig || undefined
      },
      {
        welcomeText: appForm2.chatConfig?.welcomeText || '',
        variables: appForm2.chatConfig?.variables || [],
        questionGuide: appForm2.chatConfig?.questionGuide || false,
        ttsConfig: appForm2.chatConfig?.ttsConfig || undefined,
        whisperConfig: appForm2.chatConfig?.whisperConfig || undefined,
        chatInputGuide: appForm2.chatConfig?.chatInputGuide || undefined,
        fileSelectConfig: appForm2.chatConfig?.fileSelectConfig || undefined
      }
    )
  ) {
    console.log('chatConfig not equal');
    return false;
  }

  return isEqual({ ...appForm1, chatConfig: undefined }, { ...appForm2, chatConfig: undefined });
};

export const useSimpleAppSnapshots = (appId: string) => {
  const forbiddenSaveSnapshot = useRef(false);
  const [past, setPast] = useState<SimpleAppSnapshotType[]>([]);

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
          appForm
        }
      ]);
      return true;
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
      ...past.slice(0, 99)
    ]);

    return true;
  });

  return { forbiddenSaveSnapshot, past, setPast, saveSnapshot };
};

export default function Snapshots() {
  return <></>;
}
