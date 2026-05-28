import React, { useState } from 'react';
import { Box, Center, VStack, Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FileTabs, { type OpenedFile } from './FileTabs';
import EditorContent from './EditorContent';
import InteractiveTerminal from './InteractiveTerminal';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

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
  editorRef: React.MutableRefObject<any>;
  filteredTree: any[];
  loadingFile: boolean;
  showTerminalBtn?: boolean;
  canWrite?: boolean;
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
  loadingFile,
  showTerminalBtn = false,
  canWrite = true
}: Props) => {
  const { t } = useTranslation();

  // 终端的打开/折叠状态，仅在 showTerminalBtn 为 true 时有效
  const [showTerminal, setShowTerminal] = useState(false);

  return (
    <Flex flex={1} display="flex" flexDirection="column" minH={0} w="100%" bg="myGray.25">
      {/* 1. 上部: 编辑器/空状态工作区 */}
      <MyBox
        isLoading={loadingFile}
        loadingVariant="particle"
        flex={1}
        display="flex"
        flexDirection="column"
        minH={0}
        w="100%"
        bg="white"
      >
        {openedFiles.length > 0 ? (
          <>
            <FileTabs
              openedFiles={openedFiles}
              activeFilePath={activeFilePath}
              setActiveFilePath={setActiveFilePath}
              closeFile={closeFile}
            />
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
              showTerminal={showTerminalBtn ? showTerminal : false}
              canWrite={canWrite}
              onToggleTerminal={
                showTerminalBtn ? () => setShowTerminal((prev) => !prev) : undefined
              }
            />
          </>
        ) : (
          filteredTree.length > 0 && (
            <Center h="full">
              {showTerminalBtn ? (
                <VStack spacing={4}>
                  <EmptyTip text={t('chat:sandbox_select_file_edit')} mt={0} />
                  <Button
                    size="sm"
                    variant="whiteSecondary"
                    leftIcon={<MyIcon name="core/app/sandbox/sandbox" w="16px" />}
                    onClick={() => setShowTerminal(true)}
                  >
                    {t('chat:sandbox_open_terminal', '打开终端')}
                  </Button>
                </VStack>
              ) : (
                <EmptyTip text={t('chat:sandbox_select_file_edit')} mt={0} />
              )}
            </Center>
          )
        )}
      </MyBox>

      {/* 2. 下部: 交互式 PTY 终端面板 (仅在开启 showTerminalBtn 时且处于打开状态时挂载并显示) */}
      {showTerminalBtn && showTerminal && (
        <Box h="280px" w="100%" flexShrink={0} position="relative" zIndex={2}>
          <InteractiveTerminal
            appId={appId}
            chatId={chatId}
            outLinkAuthData={outLinkAuthData}
            onClose={() => setShowTerminal(false)}
          />
        </Box>
      )}
    </Flex>
  );
};

export default React.memo(EditorWorkspace);
