import { useCallback, useState, useEffect, createContext, useContext } from 'react';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getLogoSettings } from '@/web/support/user/team/api';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { ImageTypeEnum } from '@fastgpt/global/common/file/image/type.d';

export enum ChatSidebarActionEnum {
  HOME = 'home',
  SETTING = 'setting',
  TEAM_APPS = 'team_apps',
  FAVORITE_APPS = 'favorite_apps'
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

export type ChatSettingContextValueType = {
  action: `${ChatSidebarActionEnum}`;
  setAction: (action: ChatSidebarActionEnum) => void;

  expand: `${ChatSidebarExpandEnum}`;
  setExpand: (expand: ChatSidebarExpandEnum) => void;

  isFolded: boolean;

  settingTabOption: `${ChatSettingTabOptionEnum}`;
  setSettingTabOption: (tabOption: ChatSettingTabOptionEnum) => void;

  showDiagram: boolean;
  setShowDiagram: (showDiagram: boolean) => void;

  // 通用保存状态管理
  tabSaveRegistry: TabSaveRegistry;
  registerTabSave: (tab: `${ChatSettingTabOptionEnum}`, config: TabSaveConfig) => void;
  unregisterTabSave: (tab: `${ChatSettingTabOptionEnum}`) => void;
  getCurrentTabSaveConfig: () => TabSaveConfig | undefined;
  handleCurrentTabSave: () => Promise<void>;

  // Copyright tab 特有状态
  wideLogoPreview: PreviewFileItem[];
  setWideLogoPreview: (files: PreviewFileItem[]) => void;
  squareLogoPreview: PreviewFileItem[];
  setSquareLogoPreview: (files: PreviewFileItem[]) => void;

  // 新增：当前Logo设置
  currentLogoSettings: {
    wideLogoUrl?: string;
    squareLogoUrl?: string;
  };
  refreshLogoSettings: () => Promise<void>;
};

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

  const [showDiagram, setShowDiagram] = useState(false);
  const [action, setAction] = useState(ChatSidebarActionEnum.HOME);
  const [expand, setExpand] = useState(ChatSidebarExpandEnum.EXPAND);
  const [settingTabOption, setSettingTabOption] = useState(ChatSettingTabOptionEnum.COPYRIGHT);

  // 通用tab保存注册表
  const [tabSaveRegistry, setTabSaveRegistry] = useState<TabSaveRegistry>({});

  // Copyright tab 特有状态
  const [wideLogoPreview, setWideLogoPreview] = useState<PreviewFileItem[]>([]);
  const [squareLogoPreview, setSquareLogoPreview] = useState<PreviewFileItem[]>([]);

  // 当前Logo设置状态
  const [currentLogoSettings, setCurrentLogoSettings] = useState<{
    wideLogoUrl?: string;
    squareLogoUrl?: string;
  }>({});

  // 加载Logo设置
  const refreshLogoSettings = useCallback(async () => {
    try {
      const logoSettings = await getLogoSettings();
      setCurrentLogoSettings(logoSettings);
    } catch (error) {
      console.error('Failed to load logo settings:', error);
      // 不显示错误提示，静默失败即可
    }
  }, []);

  // 组件挂载时加载Logo设置
  useEffect(() => {
    refreshLogoSettings();
  }, [refreshLogoSettings]);

  // 注册tab保存配置
  const registerTabSave = useCallback(
    (tab: `${ChatSettingTabOptionEnum}`, config: TabSaveConfig) => {
      setTabSaveRegistry((prev) => ({ ...prev, [tab]: config }));
    },
    []
  );

  // 取消注册tab保存配置
  const unregisterTabSave = useCallback((tab: `${ChatSettingTabOptionEnum}`) => {
    setTabSaveRegistry((prev) => {
      const registry = { ...prev };
      delete registry[tab];
      return registry;
    });
  }, []);

  // 获取当前tab的保存配置
  const getCurrentTabSaveConfig = useCallback(
    () => tabSaveRegistry[settingTabOption],
    [tabSaveRegistry, settingTabOption]
  );

  // 执行当前tab的保存操作
  const handleCurrentTabSave = useCallback(async () => {
    const config = getCurrentTabSaveConfig();
    if (!config || !config.saveHandler) return;
    await config.saveHandler();
  }, [getCurrentTabSaveConfig]);

  // 版权信息tab的保存逻辑
  const handleCopyrightSave = useCallback(async () => {
    if (wideLogoPreview.length === 0 && squareLogoPreview.length === 0) {
      toast({
        status: 'warning',
        title: '请先选择要上传的Logo图片'
      });
      return;
    }

    try {
      const uploadPromises: Promise<void>[] = [];

      // 上传宽Logo - 使用压缩
      if (wideLogoPreview.length > 0) {
        const wideLogo = wideLogoPreview[0];
        const uploadPromise = (async () => {
          await compressImgFileAndUpload({
            file: wideLogo.file,
            maxW: 800, // Logo可以稍大一些
            maxH: 300, // 按照4:1比例
            maxSize: 1024 * 200, // 200KB
            imageType: ImageTypeEnum.LOGO_WIDE
          });
        })();
        uploadPromises.push(uploadPromise);
      }

      // 上传方形Logo - 使用压缩
      if (squareLogoPreview.length > 0) {
        const squareLogo = squareLogoPreview[0];
        const uploadPromise = (async () => {
          await compressImgFileAndUpload({
            file: squareLogo.file,
            maxW: 400, // 方形Logo
            maxH: 400, // 1:1比例
            maxSize: 1024 * 150, // 150KB
            imageType: ImageTypeEnum.LOGO_SQUARE
          });
        })();
        uploadPromises.push(uploadPromise);
      }

      // 等待所有上传完成
      await Promise.all(uploadPromises);

      // 清除预览状态
      setWideLogoPreview([]);
      setSquareLogoPreview([]);

      // 刷新Logo设置
      await refreshLogoSettings();

      toast({
        status: 'success',
        title: 'Logo 保存成功'
      });
    } catch (error) {
      const errorMessage = getErrText(error, 'Logo 保存失败');
      toast({
        status: 'error',
        title: errorMessage
      });
      throw error;
    }
  }, [wideLogoPreview, squareLogoPreview, toast, refreshLogoSettings]);

  // 版权信息tab的保存状态
  const copyrightHasChanges = wideLogoPreview.length > 0 || squareLogoPreview.length > 0;
  const copyrightIsSaving = tabSaveRegistry[ChatSettingTabOptionEnum.COPYRIGHT]?.isSaving || false;

  // 自动注册版权信息tab
  const registerCopyrightTab = useCallback(() => {
    registerTabSave(ChatSettingTabOptionEnum.COPYRIGHT, {
      hasChanges: copyrightHasChanges,
      saveHandler: async () => {
        // 设置保存状态
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
          // 重置保存状态
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

  // 在状态变化时自动更新版权信息tab注册
  useEffect(() => {
    registerCopyrightTab();
  }, [registerCopyrightTab]);

  const value: ChatSettingContextValueType = {
    action,
    setAction,
    expand,
    setExpand,
    isFolded: expand === ChatSidebarExpandEnum.FOLD,
    settingTabOption,
    setSettingTabOption,
    showDiagram,
    setShowDiagram,
    tabSaveRegistry,
    registerTabSave,
    unregisterTabSave,
    getCurrentTabSaveConfig,
    handleCurrentTabSave,
    wideLogoPreview,
    setWideLogoPreview,
    squareLogoPreview,
    setSquareLogoPreview,
    currentLogoSettings,
    refreshLogoSettings
  };

  return <ChatSettingContext.Provider value={value}>{children}</ChatSettingContext.Provider>;
};
