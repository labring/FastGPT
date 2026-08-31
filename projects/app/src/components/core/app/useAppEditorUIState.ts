import { useCallback } from 'react';
import { useLocalStorageState } from 'ahooks';

type AppEditorUIState = {
  welcomeTextFoldedAppIds: Record<string, true>;
  systemConfig: {
    hasCompletedFirstEntryGuide: boolean;
  };
  workflowBuilder?: {
    hasCompletedFirstEntryGuide: boolean;
  };
};

const APP_EDITOR_UI_STATE_STORAGE_KEY = 'app-editor-ui-state';

const DEFAULT_APP_EDITOR_UI_STATE: AppEditorUIState = {
  welcomeTextFoldedAppIds: {},
  systemConfig: {
    hasCompletedFirstEntryGuide: false
  },
  workflowBuilder: {
    hasCompletedFirstEntryGuide: false
  }
};

/** 读取并更新应用编辑器的本地 UI 偏好。 */
export const useAppEditorUIState = (appId = '') => {
  const [state = DEFAULT_APP_EDITOR_UI_STATE, setState] = useLocalStorageState<AppEditorUIState>(
    APP_EDITOR_UI_STATE_STORAGE_KEY,
    {
      defaultValue: DEFAULT_APP_EDITOR_UI_STATE,
      listenStorageChange: true
    }
  );

  const isWelcomeTextFolded = appId ? !!state.welcomeTextFoldedAppIds[appId] : false;

  const toggleWelcomeTextFold = useCallback(() => {
    if (!appId) return;

    setState((state = DEFAULT_APP_EDITOR_UI_STATE) => {
      const welcomeTextFoldedAppIds = { ...state.welcomeTextFoldedAppIds };

      if (welcomeTextFoldedAppIds[appId]) {
        delete welcomeTextFoldedAppIds[appId];
      } else {
        welcomeTextFoldedAppIds[appId] = true;
      }

      return {
        ...state,
        welcomeTextFoldedAppIds
      };
    });
  }, [appId, setState]);

  const completeSystemConfigFirstEntryGuide = useCallback(() => {
    setState((state = DEFAULT_APP_EDITOR_UI_STATE) => {
      if (state.systemConfig.hasCompletedFirstEntryGuide) return state;

      return {
        ...state,
        systemConfig: {
          ...state.systemConfig,
          hasCompletedFirstEntryGuide: true
        }
      };
    });
  }, [setState]);

  const completeWorkflowBuilderFirstEntryGuide = useCallback(() => {
    setState((state = DEFAULT_APP_EDITOR_UI_STATE) => {
      if (state.workflowBuilder?.hasCompletedFirstEntryGuide) return state;

      return {
        ...state,
        workflowBuilder: {
          hasCompletedFirstEntryGuide: true
        }
      };
    });
  }, [setState]);

  return {
    isWelcomeTextFolded,
    toggleWelcomeTextFold,
    hasCompletedSystemConfigFirstEntryGuide: state.systemConfig.hasCompletedFirstEntryGuide,
    completeSystemConfigFirstEntryGuide,
    hasCompletedWorkflowBuilderFirstEntryGuide:
      state.workflowBuilder?.hasCompletedFirstEntryGuide ?? false,
    completeWorkflowBuilderFirstEntryGuide
  };
};

/** 按应用记录对话开场白的折叠状态。 */
export const useWelcomeTextFoldState = (appId: string) => {
  const { isWelcomeTextFolded, toggleWelcomeTextFold } = useAppEditorUIState(appId);

  return {
    isWelcomeTextFolded,
    toggleWelcomeTextFold
  };
};
