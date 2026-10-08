import React, { useState, useRef, useCallback } from 'react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { Box, Button, Flex } from '@chakra-ui/react';
import MyLoading from '@fastgpt/web/components/common/MyLoading';
import AdminHeader from '../AdminHeader';
import AdminSettingTOC, { type SettingTOCItem } from './AdminSettingTOC';

type AdminSettingPageProps = {
  headerTitle?: string;
  headerDescription?: string;
  headerRightContent?: React.ReactNode;
  tocItems: SettingTOCItem[];
  isLoading?: boolean;
  isSaving?: boolean;
  onSave?: () => void;
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
  children,
  maxW = '840px'
}: AdminSettingPageProps) => {
  const { t } = useClientTranslation();
  const [activeId, setActiveId] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentActiveId = activeId || tocItems[0]?.id || '';

  // 滚动监听，实时计算当前视口中最高亮的首个可见大区
  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
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
  }, [tocItems]);

  const headerActions =
    headerRightContent ||
    (onSave && (
      <Button colorScheme={'blue'} size={'sm'} px={6} isLoading={isSaving} onClick={onSave}>
        {t('common:Save')}
      </Button>
    ));

  return (
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
            ref={scrollRef}
            flex={'1 0 0'}
            minW={0}
            h={'100%'}
            overflowY={'auto'}
            onScroll={handleScroll}
          >
            <Box p={8} bg={'white'}>
              <Box w={'100%'} maxW={maxW} mx={'auto'} pb={20}>
                {children}
              </Box>
            </Box>
          </Box>

          {/* 右侧 TOC 侧边栏：专注于纯粹的目录导航 */}
          <Box
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
};

export default React.memo(AdminSettingPage);
