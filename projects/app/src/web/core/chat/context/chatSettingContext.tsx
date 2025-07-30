import { useCallback, useState, useEffect, createContext, useContext } from 'react';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getLogos } from '@/web/core/chat/api';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { ImageTypeEnum } from '@fastgpt/global/common/file/image/type.d';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';

export enum ChatSidebarActionEnum {
  HOME = 'home',
  SETTING = 'setting',
  FAVORITE_APPS = 'favorite_apps',

  // these two features are only available in the open source version
  TEAM_APPS = 'team_apps',
  RECENTLY_USED_APPS = 'recently_used_apps'
}

export enum ChatSidebarExpandEnum {
  FOLD = 'fold',
  EXPAND = 'expand'
}

export enum ChatSettingTabOptionEnum {
  HOME = 'home',
  COPYRIGHT = 'copyright',
  FAVORITE_APPS = 'favorite_apps',
  LOGS = 'logs'
}

export type PreviewFileItem = {
  file: File;
  url: string;
};

// 通用的tab保存配置
export type TabSaveConfig = {
  hasChanges: boolean;
  saveHandler: () => Promise<void>;
  isSaving: boolean;
};

export type TabSaveRegistry = {
  [key in ChatSettingTabOptionEnum]?: TabSaveConfig;
};

// general values for this context
export type ChatSettingGeneralValue = {
  // for check the tab save status
  tabSaveRegistry: TabSaveRegistry;
  registerTabSave: (tab: `${ChatSettingTabOptionEnum}`, config: TabSaveConfig) => void;
  unregisterTabSave: (tab: `${ChatSettingTabOptionEnum}`) => void;
  getCurrentTabSaveConfig: () => TabSaveConfig | undefined;
  handleCurrentTabSave: () => Promise<void>;

  // for logo settings
  currentLogoSettings: {
    wideLogoUrl?: string;
    squareLogoUrl?: string;
  };
  refreshLogoSettings: () => Promise<void>;
  wideLogoPreview: PreviewFileItem[];
  setWideLogoPreview: (files: PreviewFileItem[]) => void;
  squareLogoPreview: PreviewFileItem[];
  setSquareLogoPreview: (files: PreviewFileItem[]) => void;
};

// controls for this context
export type ChatSettingControls = {
  action: `${ChatSidebarActionEnum}`;
  setAction: (action: ChatSidebarActionEnum) => void;
  expand: `${ChatSidebarExpandEnum}`;
  setExpand: (expand: ChatSidebarExpandEnum) => void;
  settingTabOption: `${ChatSettingTabOptionEnum}`;
  setSettingTabOption: (tabOption: ChatSettingTabOptionEnum) => void;
  showDiagram: boolean;
  setShowDiagram: (showDiagram: boolean) => void;
};

// computed values for this context
export type ChatSettingComputedValue = {
  isFold: boolean;
  isLoggedIn: boolean;
  isAdminPermission: boolean;
  isCommercialVersion: boolean;
};

export type ChatSettingContextValueType = ChatSettingGeneralValue &
  ChatSettingControls &
  ChatSettingComputedValue;

export const ChatSettingContext = createContext<ChatSettingContextValueType | null>(null);

export const useChatSettingContext = () => {
  const context = useContext(ChatSettingContext);
  if (!context) {
    throw new Error('useChatSettingContext must be used within a ChatSettingContextProvider');
  }
  return context;
};

export const ChatSettingContextProvider = ({ children }: { children: React.ReactNode }) => {
  const { toast } = useToast();

  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();

  const [showDiagram, setShowDiagram] = useState(false);
  const [action, setAction] = useState(ChatSidebarActionEnum.HOME);
  const [expand, setExpand] = useState(ChatSidebarExpandEnum.EXPAND);
  const [settingTabOption, setSettingTabOption] = useState(ChatSettingTabOptionEnum.COPYRIGHT);

  // general tab save registry
  const [tabSaveRegistry, setTabSaveRegistry] = useState<TabSaveRegistry>({});

  // `copyright` tab specific state
  const [wideLogoPreview, setWideLogoPreview] = useState<PreviewFileItem[]>([]);
  const [squareLogoPreview, setSquareLogoPreview] = useState<PreviewFileItem[]>([]);

  // current logo settings state
  const [currentLogoSettings, setCurrentLogoSettings] = useState<{
    wideLogoUrl?: string;
    squareLogoUrl?: string;
  }>({});

  // copyright tab save status
  const copyrightHasChanges = wideLogoPreview.length > 0 || squareLogoPreview.length > 0;
  const copyrightIsSaving = tabSaveRegistry[ChatSettingTabOptionEnum.COPYRIGHT]?.isSaving || false;
  const isCommercialVersion = !!feConfigs.isPlus;

  // load logo settings
  const refreshLogoSettings = useCallback(async () => {
    try {
      const logoSettings = await getLogos();
      setCurrentLogoSettings(logoSettings);
    } catch (error) {
      console.error('Failed to load logo settings:', error);
    }
  }, []);

  // register tab save config
  const registerTabSave = useCallback(
    (tab: `${ChatSettingTabOptionEnum}`, config: TabSaveConfig) => {
      setTabSaveRegistry((prev) => ({ ...prev, [tab]: config }));
    },
    []
  );

  // unregister tab save config
  const unregisterTabSave = useCallback((tab: `${ChatSettingTabOptionEnum}`) => {
    setTabSaveRegistry((prev) => {
      const { [tab]: _, ...r } = prev;
      return r;
    });
  }, []);

  // get current tab save config
  const getCurrentTabSaveConfig = useCallback(
    () => tabSaveRegistry[settingTabOption],
    [tabSaveRegistry, settingTabOption]
  );

  // handle current tab save
  const handleCurrentTabSave = useCallback(async () => {
    const config = getCurrentTabSaveConfig();
    if (!config || !config.saveHandler) return;
    await config.saveHandler();
  }, [getCurrentTabSaveConfig]);

  // copyright tab save logic
  const handleCopyrightSave = useCallback(async () => {
    if (wideLogoPreview.length === 0 && squareLogoPreview.length === 0) {
      toast({
        status: 'warning',
        title: '请先选择要上传的Logo图片' // TODO: i18n
      });
      return;
    }

    try {
      const uploadPromises: Promise<void>[] = [];

      // upload wide logo - using compression
      if (wideLogoPreview.length > 0) {
        const wideLogo = wideLogoPreview[0];
        const uploadPromise = (async () => {
          await compressImgFileAndUpload({
            file: wideLogo.file,
            maxW: 800, // logo can be a little larger
            maxH: 300, // 4:1 ratio
            maxSize: 1024 * 200, // 200KB
            imageType: ImageTypeEnum.LOGO_WIDE
          });
        })();
        uploadPromises.push(uploadPromise);
      }

      // upload square logo - using compression
      if (squareLogoPreview.length > 0) {
        const squareLogo = squareLogoPreview[0];
        const uploadPromise = (async () => {
          await compressImgFileAndUpload({
            file: squareLogo.file,
            maxW: 400, // square logo
            maxH: 400, // 1:1 ratio
            maxSize: 1024 * 150, // 150KB
            imageType: ImageTypeEnum.LOGO_SQUARE
          });
        })();
        uploadPromises.push(uploadPromise);
      }

      // wait for all uploads to complete
      await Promise.all(uploadPromises);

      // clear preview state
      setWideLogoPreview([]);
      setSquareLogoPreview([]);

      // refresh logo settings
      await refreshLogoSettings();

      toast({
        status: 'success',
        title: 'Logo 保存成功' // TODO: i18n
      });
    } catch (error) {
      const errorMessage = getErrText(error, 'Logo 保存失败'); // TODO: i18n
      toast({
        status: 'error',
        title: errorMessage
      });
      throw error;
    }
  }, [wideLogoPreview, squareLogoPreview, toast, refreshLogoSettings]);

  // auto register copyright tab
  const registerCopyrightTab = useCallback(() => {
    registerTabSave(ChatSettingTabOptionEnum.COPYRIGHT, {
      hasChanges: copyrightHasChanges,
      saveHandler: async () => {
        // set save status
        setTabSaveRegistry((prev) => ({
          ...prev,
          [ChatSettingTabOptionEnum.COPYRIGHT]: {
            ...prev[ChatSettingTabOptionEnum.COPYRIGHT]!,
            isSaving: true
          }
        }));

        try {
          await handleCopyrightSave();
        } finally {
          // reset save status
          setTabSaveRegistry((prev) => ({
            ...prev,
            [ChatSettingTabOptionEnum.COPYRIGHT]: {
              ...prev[ChatSettingTabOptionEnum.COPYRIGHT]!,
              isSaving: false
            }
          }));
        }
      },
      isSaving: copyrightIsSaving
    });
  }, [copyrightHasChanges, copyrightIsSaving, handleCopyrightSave, registerTabSave]);

  // auto register copyright tab
  useEffect(() => {
    registerCopyrightTab();
  }, [registerCopyrightTab]);

  // load logo settings when component mounted
  useEffect(() => {
    refreshLogoSettings();
  }, [refreshLogoSettings]);

  useEffect(() => {
    if (!isCommercialVersion) {
      setAction(ChatSidebarActionEnum.RECENTLY_USED_APPS);
    }
  }, [isCommercialVersion, setAction]);

  const value: ChatSettingContextValueType = {
    //----------- controls -------------//
    action,
    setAction,
    expand,
    setExpand,
    settingTabOption,
    setSettingTabOption,
    showDiagram,
    setShowDiagram,

    //----------- tab status -------------//
    tabSaveRegistry,
    registerTabSave,
    unregisterTabSave,
    getCurrentTabSaveConfig,
    handleCurrentTabSave,

    //--------- logo setting ------------//
    currentLogoSettings,
    refreshLogoSettings,
    wideLogoPreview,
    setWideLogoPreview,
    squareLogoPreview,
    setSquareLogoPreview,

    //----------- computed state -------------//
    isCommercialVersion,
    isLoggedIn: !!userInfo,
    isFold: expand === ChatSidebarExpandEnum.FOLD,
    isAdminPermission: userInfo?.permission.hasManagePer || false
  };

  return <ChatSettingContext.Provider value={value}>{children}</ChatSettingContext.Provider>;
};
