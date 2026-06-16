import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Box, Center, Flex, Text, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FileTabs, { type OpenedFile } from './FileTabs';
import EditorContent from './EditorContent';
import InteractiveTerminal from './InteractiveTerminal';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import ParticleLoading from '@fastgpt/web/components/common/MyLoading/ParticleLoading';
import RandomGridBackground from './RandomGridBackground';
import type { TreeNode } from './FileTree';
import type { SandboxEditorInstance } from '../types';

type Props = {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  showDownload?: boolean;
  defaultViewMode?: 'source' | 'preview';
  openedFiles: OpenedFile[];
  setOpenedFiles: React.Dispatch<React.SetStateAction<OpenedFile[]>>;
  activeFilePath: string;
  setActiveFilePath: (path: string) => void;
  closeFile: (path: string) => void;
  activeFile: OpenedFile | undefined;
  downloadingFile: boolean;
  downloadCurrentFile: () => void;
  saveFile: (path?: string) => void;
  editorRef: React.MutableRefObject<SandboxEditorInstance | undefined>;
  filteredTree: TreeNode[];
  showTerminalBtn?: boolean;
  canWrite?: boolean;
  headerRight?: React.ReactNode;
  isPreparing?: boolean;
  isWsConnected?: boolean;
  loadingRoot?: boolean;
  hasFiles: boolean;
};

const EditorWorkspace = ({
  appId,
  chatId,
  outLinkAuthData,
  showDownload = true,
  defaultViewMode,
  openedFiles,
  setOpenedFiles,
  activeFilePath,
  setActiveFilePath,
  closeFile,
  activeFile,
  downloadingFile,
  downloadCurrentFile,
  saveFile,
  editorRef,
  filteredTree,
  showTerminalBtn = false,
  canWrite = true,
  headerRight,
  isPreparing = false,
  isWsConnected = false,
  loadingRoot = false,
  hasFiles
}: Props) => {
  const { t } = useTranslation();

  // 终端的打开/折叠状态，仅在 showTerminalBtn 为 true 时有效
  const [showTerminal, setShowTerminal] = useState(false);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspaceHeight, setWorkspaceHeight] = useState<number>(0);
  const [terminalHeight, setTerminalHeight] = useState<number>(200);
  const hasInitializedHeight = useRef(false);

  useEffect(() => {
    if (!workspaceRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { height } = entry.contentRect;
        setWorkspaceHeight(height);
      }
    });
    observer.observe(workspaceRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (workspaceHeight > 0 && !hasInitializedHeight.current) {
      setTerminalHeight(Math.round(workspaceHeight * 0.3));
      hasInitializedHeight.current = true;
    }
  }, [workspaceHeight]);

  const handleTerminalResizeStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const startY = e.clientY;
      const startHeight = terminalHeight;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (event: MouseEvent) => {
        const deltaY = event.clientY - startY;
        const newHeight = startHeight - deltaY;

        const minH = Math.max(100, Math.round(workspaceHeight * 0.1));
        const maxH = Math.round(workspaceHeight * 0.8);
        const boundedHeight = Math.min(Math.max(newHeight, minH), maxH);

        setTerminalHeight(boundedHeight);
      };

      const handleMouseUp = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [terminalHeight, workspaceHeight]
  );

  const loadingLines = useMemo(() => {
    const lines: string[] = [];
    const isStage1 = isPreparing;
    const isStage2 = !isStage1 && (!isWsConnected || loadingRoot) && filteredTree.length === 0;

    if (isStage1 || isStage2) {
      lines.push(t('chat:sandbox_starting'));
    }
    if (isStage2) {
      lines.push(t('chat:sandbox_file_loading'));
    }
    return lines;
  }, [isPreparing, isWsConnected, loadingRoot, filteredTree.length, t]);

  const canUseTerminal = showTerminalBtn && canWrite && loadingLines.length === 0;
  const showWorkspaceHeader = openedFiles.length > 0 || !!headerRight;

  const mainEditorNode = (
    <MyBox flex={1} display="flex" flexDirection="column" minH={0} w="100%" bg="white">
      {loadingLines.length > 0 ? (
        <Flex
          flex={1}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          bg="myGray.25"
          h="full"
          w="full"
          position="relative"
        >
          <RandomGridBackground />
          <Box zIndex={1} display="flex" flexDirection="column" alignItems="center">
            <ParticleLoading size="lg" />
            {loadingLines[0] && (
              <Box position="relative" mt="20px" w="full" textAlign="center">
                <Text fontSize="14px" color="myGray.500" fontWeight="400" lineHeight="21px">
                  {loadingLines[0]}
                </Text>
                {loadingLines[1] && (
                  <Text
                    position="absolute"
                    top="21px"
                    left="50%"
                    transform="translateX(-50%)"
                    whiteSpace="nowrap"
                    fontSize="14px"
                    color="myGray.500"
                    fontWeight="400"
                    lineHeight="21px"
                  >
                    {loadingLines[1]}
                  </Text>
                )}
              </Box>
            )}
          </Box>
        </Flex>
      ) : openedFiles.length > 0 ? (
        <EditorContent
          activeFile={activeFile}
          activeFilePath={activeFilePath}
          downloadingFile={downloadingFile}
          downloadCurrentFile={downloadCurrentFile}
          saveFile={saveFile}
          setOpenedFiles={setOpenedFiles}
          openedFiles={openedFiles}
          editorRef={editorRef}
          appId={appId}
          chatId={chatId}
          outLinkAuthData={outLinkAuthData}
          showDownload={showDownload}
          defaultViewMode={defaultViewMode}
          canWrite={canWrite}
        />
      ) : hasFiles ? (
        <Center h="full">
          <EmptyTip text={t('chat:sandbox_select_file_edit')} mt={0} />
        </Center>
      ) : (
        <Center h="full">
          <EmptyTip text={t('chat:sandbox_no_file')} mt={0} />
        </Center>
      )}
    </MyBox>
  );

  return (
    <Flex flex={1} display="flex" flexDirection="column" minH={0} w="100%" bg="transparent">
      {/* 1. 顶部行: 页签在左，历史记录和发布按钮在右 */}
      {showWorkspaceHeader && (
        <Flex
          flexShrink={0}
          h={'40px'}
          alignItems={'center'}
          justifyContent={'space-between'}
          bg="transparent"
          borderBottom="none"
          mb={'8px'}
          gap="12px"
        >
          <Box flex={1} minW={0} h="full" display="flex" alignItems="center">
            {openedFiles.length > 0 && (
              <FileTabs
                openedFiles={openedFiles}
                activeFilePath={activeFilePath}
                setActiveFilePath={setActiveFilePath}
                closeFile={closeFile}
              />
            )}
          </Box>
          {headerRight && (
            <Box pr={0} flexShrink={0}>
              {headerRight}
            </Box>
          )}
        </Flex>
      )}

      {/* 2. 主体部分与终端卡片 */}
      <Box
        ref={workspaceRef}
        flex={1}
        minH={0}
        w="100%"
        bg="white"
        border="1px solid"
        borderColor="myGray.200"
        borderRadius="lg"
        overflow="hidden"
        display="flex"
        flexDirection="column"
      >
        {mainEditorNode}
        {canUseTerminal && (
          <Box
            h={showTerminal ? `${terminalHeight}px` : '40px'}
            w="100%"
            flexShrink={0}
            position="relative"
            zIndex={2}
            borderTop={'1px solid'}
            borderColor={'myGray.200'}
            display="flex"
            flexDirection="column"
            bg="white"
          >
            {/* Drag Handle Top Border Line (only active when showTerminal is true) */}
            {showTerminal && (
              <Box
                position="absolute"
                top="-3px"
                left={0}
                right={0}
                h="6px"
                cursor="ns-resize"
                zIndex={3}
                onMouseDown={handleTerminalResizeStart}
                bg="transparent"
              />
            )}

            {/* Terminal Panel Header */}
            <Flex
              h="40px"
              px={4}
              alignItems="center"
              justifyContent="space-between"
              cursor={!showTerminal ? 'pointer' : 'default'}
              onClick={!showTerminal ? () => setShowTerminal(true) : undefined}
              userSelect="none"
              bg="white"
              borderBottom={showTerminal ? '1px solid' : 'none'}
              borderColor="myGray.200"
            >
              <Flex alignItems="center">
                <Text fontSize="14px" fontWeight="semibold" color="myGray.600" lineHeight="20px">
                  {t('chat:sandbox_terminal', '终端')}
                </Text>
              </Flex>
              <Flex alignItems="center" gap={2}>
                <IconButton
                  size="xs"
                  variant="unstyled"
                  aria-label="Toggle Terminal"
                  icon={
                    <MyIcon
                      name={showTerminal ? 'core/chat/chevronDown' : 'core/chat/chevronUp'}
                      w="14px"
                      color="myGray.600"
                    />
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTerminal((prev) => !prev);
                  }}
                  _hover={{ bg: 'myGray.100' }}
                  display="inline-flex"
                  alignItems="center"
                  justifyContent="center"
                />
              </Flex>
            </Flex>

            {/* Terminal Core */}
            {showTerminal && (
              <Box flex={1} minH={0} w="100%">
                <InteractiveTerminal
                  appId={appId}
                  chatId={chatId}
                  outLinkAuthData={outLinkAuthData}
                  canWrite={canWrite}
                />
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Flex>
  );
};

export default React.memo(EditorWorkspace);
