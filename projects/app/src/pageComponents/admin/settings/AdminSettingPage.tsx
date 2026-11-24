import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { throttle } from 'lodash-es';
import { Box, Button, Flex } from '@chakra-ui/react';
import MyLoading from '@fastgpt/web/components/common/MyLoading';
import AdminHeader from '../AdminHeader';
import AdminSettingTOC, { type SettingTOCItem } from './AdminSettingTOC';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { FormProvider, type UseFormReturn } from 'react-hook-form';
import { getConfigFormErrors } from '@/web/common/system/configFormErrors';

type AdminSettingPageProps = {
  headerTitle?: string;
  headerDescription?: string;
  headerRightContent?: React.ReactNode;
  tocItems: SettingTOCItem[];
  isLoading?: boolean;
  isSaving?: boolean;
  onSave?: () => void | Promise<unknown>;
  form?: UseFormReturn<any>;
  fieldAliases?: Record<string, string>;
  onSaveError?: (error: unknown) => void;
  children: React.ReactNode;
  maxW?: string;
};

/**
 * 新版配置页面统一母版组件：
 * - 顶部区域：统一 Header（左侧标题/说明，右侧操作区，如保存按钮）；
 * - 中间区域：表单配置大区，支持顺畅滚动与锚点挂载；
 * - 右侧侧栏：新版纯净文字高亮 TOC 目录，带平滑滚动与实时 ScrollSpy 滚动高亮联动。
 */
const AdminSettingPage = ({
  headerTitle,
  headerDescription,
  headerRightContent,
  tocItems,
  isLoading = false,
  isSaving = false,
  onSave,
  form,
  fieldAliases,
  onSaveError,
  children,
  maxW = '840px'
}: AdminSettingPageProps) => {
  const { t } = useSafeTranslation();
  /** 保存失败保留草稿和 revision，把后端字段错误落到当前页面，提示由请求层统一展示。 */
  const save = async () => {
    form?.clearErrors();
    try {
      await onSave?.();
    } catch (error) {
      onSaveError?.(error);
      if (!form) return;
      const errors = getConfigFormErrors({
        error,
        values: form.getValues(),
        aliases: fieldAliases
      });
      errors.forEach(({ name, message }) => form.setError(name, { type: 'server', message }));
      if (errors[0]) form.setFocus(errors[0].name);
    }
  };
  const [activeId, setActiveId] = useState<string>('');
  const currentActiveId = tocItems.some((item) => item.id === activeId)
    ? activeId
    : tocItems[0]?.id || '';

  // 滚动监听，实时计算当前视口中最高亮的首个可见大区。
  // 每帧都会触发且内部多次 getBoundingClientRect 强制同步布局，沿用旧版 100ms 节流避免滚动掉帧。
  // 容器通过滚动事件的 currentTarget 传入，避免在渲染期创建的节流闭包里读取 ref。
  const computeActiveId = useCallback(
    (container: HTMLElement | null) => {
      if (!container || tocItems.length === 0) return;

      const containerTop = container.getBoundingClientRect().top;
      let currentId = tocItems[0].id;

      for (const item of tocItems) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top - containerTop <= 100) {
          currentId = item.id;
        }
      }

      setActiveId(currentId);
    },
    [tocItems]
  );

  const handleScroll = useMemo(
    () => throttle((container: HTMLElement | null) => computeActiveId(container), 100),
    [computeActiveId]
  );
  // 卸载时取消挂起的节流调用，避免在已卸载组件上 setState
  useEffect(() => () => handleScroll.cancel(), [handleScroll]);

  const headerActions =
    headerRightContent ||
    (onSave && (
      <Button colorScheme={'blue'} size={'sm'} px={6} isLoading={isSaving} onClick={save}>
        {t('common:Save')}
      </Button>
    ));

  const content = (
    <>
      {isLoading && <MyLoading />}
      <Flex flexDirection={'column'} h={'100%'} w={'100%'} overflow={'hidden'}>
        {/* 顶部统一 Header：右侧承载保存等核心操作 */}
        {headerTitle && (
          <AdminHeader
            title={headerTitle}
            description={headerDescription}
            rightContent={headerActions}
          />
        )}

        {/* 下方主体：左侧表单 + 右侧 TOC */}
        <Flex flex={'1 0 0'} h={'100%'} w={'100%'} overflow={'hidden'}>
          {/* 中间表单区域 */}
          <Box
            flex={'1 0 0'}
            minW={0}
            h={'100%'}
            overflowY={'auto'}
            onScroll={(e) => handleScroll(e.currentTarget)}
          >
            <Box p={{ base: 4, md: 8 }} bg={'white'}>
              <Box w={'100%'} maxW={maxW} mx={'auto'} pb={20}>
                {children}
              </Box>
            </Box>
          </Box>

          {/* 右侧 TOC 侧边栏：专注于纯粹的目录导航 */}
          <Box
            display={{ base: 'none', md: 'block' }}
            flex={'0 0 200px'}
            w={'200px'}
            h={'100%'}
            overflowY={'auto'}
            borderLeft={'1px solid'}
            borderColor={'myGray.200'}
            bg={'white'}
          >
            <AdminSettingTOC
              items={tocItems}
              activeId={currentActiveId}
              onItemClick={setActiveId}
            />
          </Box>
        </Flex>
      </Flex>
    </>
  );
  return form ? <FormProvider {...form}>{content}</FormProvider> : content;
};

export default React.memo(AdminSettingPage);
