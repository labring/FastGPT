import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import type { SkillOptionType } from '@fastgpt/web/components/common/Textarea/PromptEditor/plugins/SkillPickerPlugin';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getTeamPlugTemplates } from '@/web/core/app/api/plugin';

type UseAppManagerProps = {
  selectedSkillKey?: string;
  currentAppId?: string;
};

type UseAppManagerReturn = {
  appSkillOptions: SkillOptionType[];
  queryString: string | null;
  setQueryString: (value: string | null) => void;
  loadFolderContent: (folderId: string) => Promise<void>;
  removeFolderContent: (folderId: string) => void;
  loadedFolders: Set<string>;
};

export const useAppManager = ({
  selectedSkillKey,
  currentAppId
}: UseAppManagerProps): UseAppManagerReturn => {
  const { t, i18n } = useTranslation();
  const lang = i18n?.language as localeType;
  const [appSkillOptions, setAppSkillOptions] = useState<SkillOptionType[]>([]);
  const [queryString, setQueryString] = useState<string | null>(null);
  const [loadedFolders, setLoadedFolders] = useState<Set<string>>(new Set());
  const appSkillOptionsRef = useRef<SkillOptionType[]>([]);
  const defaultAppSkillOption = useMemo(() => {
    return {
      key: 'app',
      label: t('common:App'),
      icon: 'core/workflow/template/runApp'
    };
  }, [t]);

  const buildAppSkillOptions = useCallback(
    (teamApps: NodeTemplateListItemType[], parentKey: string = 'app') => {
      return teamApps
        .filter((app) => app.id !== currentAppId) // 过滤掉当前应用
        .map((app) => ({
          key: app.id,
          label: t(parseI18nString(app.name, lang)),
          icon: app.isFolder ? 'common/folderFill' : app.avatar || 'core/workflow/template/runApp',
          parentKey,
          canOpen: app.isFolder
        }));
    },
    [t, lang, currentAppId]
  );

  const loadFolderContent = useCallback(
    async (folderId: string) => {
      if (loadedFolders.has(folderId)) return;

      try {
        // 先添加 loading 占位符
        setAppSkillOptions((prev) => {
          const newOptions = [
            ...prev,
            {
              key: 'loading',
              label: 'Loading...',
              icon: '',
              parentKey: folderId
            }
          ];
          appSkillOptionsRef.current = newOptions;
          return newOptions;
        });

        // 加载文件夹内容
        const children = await getTeamPlugTemplates({
          parentId: folderId,
          searchKey: ''
        });

        // 构建子项选项
        const childOptions = buildAppSkillOptions(children, folderId);

        // 替换 loading 占位符为实际内容
        setAppSkillOptions((prev) => {
          const filteredOptions = prev.filter(
            (opt) => !(opt.parentKey === folderId && opt.key === 'loading')
          );
          const newOptions = [...filteredOptions, ...childOptions];
          appSkillOptionsRef.current = newOptions;
          return newOptions;
        });

        // 标记已加载
        setLoadedFolders((prev) => new Set([...prev, folderId]));
      } catch (error) {
        console.error('Failed to load folder content:', error);
        // 移除 loading 占位符
        setAppSkillOptions((prev) => {
          const newOptions = prev.filter(
            (opt) => !(opt.parentKey === folderId && opt.key === 'loading')
          );
          appSkillOptionsRef.current = newOptions;
          return newOptions;
        });
      }
    },
    [loadedFolders, buildAppSkillOptions]
  );

  const removeFolderContent = useCallback((folderId: string) => {
    // 递归移除文件夹及其所有子项的内容
    const removeRecursively = (parentId: string) => {
      const children = appSkillOptionsRef.current.filter((opt) => opt.parentKey === parentId);
      children.forEach((child) => {
        if (child.canOpen) {
          removeRecursively(child.key);
        }
      });
    };

    // 移除文件夹的所有子项
    removeRecursively(folderId);

    // 从数据中移除所有子项
    setAppSkillOptions((prev) => {
      const newOptions = prev.filter((opt) => {
        // 检查是否是要移除的文件夹的后代
        const isDescendant = (optionKey: string): boolean => {
          const option = prev.find((o) => o.key === optionKey);
          if (!option?.parentKey) return false;
          if (option.parentKey === folderId) return true;
          return isDescendant(option.parentKey);
        };

        return !isDescendant(opt.key);
      });
      appSkillOptionsRef.current = newOptions;
      return newOptions;
    });

    // 从已加载集合中移除
    setLoadedFolders((prevLoaded) => {
      const newLoaded = new Set(prevLoaded);
      newLoaded.delete(folderId);
      return newLoaded;
    });
  }, []);

  useRequest2(
    async () => {
      try {
        return await getTeamPlugTemplates({
          parentId: '',
          searchKey: queryString?.trim() || ''
        });
      } catch (error) {
        console.error('Failed to load team plugin templates:', error);
        return [];
      }
    },
    {
      manual: false,
      refreshDeps: [queryString],
      onSuccess(data) {
        const options = buildAppSkillOptions(data);
        const newOptions = [defaultAppSkillOption, ...options];
        setAppSkillOptions(newOptions);
        appSkillOptionsRef.current = newOptions;
      }
    }
  );

  return {
    appSkillOptions,
    queryString,
    setQueryString,
    loadFolderContent,
    removeFolderContent,
    loadedFolders
  };
};
