import { useCallback } from 'react';
import { useLocalStorageState } from 'ahooks';

type WelcomeTextFoldState = Record<string, boolean>;

const WELCOME_TEXT_FOLD_STATE_STORAGE_KEY = 'app-welcome-text-fold-state';

/**
 * 按应用记录对话开场白的折叠状态，供不同应用编辑入口共享同一份本地 UI 偏好。
 * 未记录或尚无 AppID 时默认展开；恢复展开后移除对应记录，避免无效状态持续累积。
 */
export const useWelcomeTextFoldState = (appId: string) => {
  const [foldState = {}, setFoldState] = useLocalStorageState<WelcomeTextFoldState>(
    WELCOME_TEXT_FOLD_STATE_STORAGE_KEY,
    {
      defaultValue: {},
      listenStorageChange: true
    }
  );

  const isWelcomeTextFolded = appId ? (foldState[appId] ?? false) : false;

  const toggleWelcomeTextFold = useCallback(() => {
    if (!appId) return;
    setFoldState((state) => {
      const nextState = { ...(state ?? {}) };

      if (nextState[appId]) {
        delete nextState[appId];
      } else {
        nextState[appId] = true;
      }

      return nextState;
    });
  }, [appId, setFoldState]);

  return {
    isWelcomeTextFolded,
    toggleWelcomeTextFold
  };
};
