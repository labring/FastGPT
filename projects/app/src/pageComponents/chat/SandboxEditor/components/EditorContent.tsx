import React from 'react';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Editor from '@monaco-editor/react';
import { useTranslation } from 'next-i18next';
import type { OpenedFile } from './FileTabs';

type EditorInstance = Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0];

type Props = {
  activeFile: OpenedFile | undefined;
  activeFilePath: string;
  saving: boolean;
  downloadingFile: boolean;
  downloadCurrentFile: () => void;
  saveFile: (path?: string) => void;
  setOpenedFiles: React.Dispatch<React.SetStateAction<OpenedFile[]>>;
  openedFiles: OpenedFile[];
  editorRef: React.MutableRefObject<EditorInstance | undefined>;
  isUpdatingRef: React.MutableRefObject<boolean>;
};

const EditorContent = ({
  activeFile,
  activeFilePath,
  saving,
  downloadingFile,
  downloadCurrentFile,
  saveFile,
  setOpenedFiles,
  openedFiles,
  editorRef,
  isUpdatingRef
}: Props) => {
  const { t } = useTranslation();

  return (
    <Flex
      flex={'1 0 0'}
      m={3}
      p={3}
      border="base"
      flexDirection="column"
      borderRadius={'md'}
      bg={'white'}
    >
      {/* 文件信息栏 */}
      <Flex
        align="center"
        justify="space-between"
        borderBottom={'sm'}
        mt={'-3px'}
        pb={'9px'}
        mb={3}
      >
        <Box fontSize="20px" fontWeight="500" color="black">
          {activeFile?.name || ''}
        </Box>
        <Flex align="center" gap={2}>
          {/* 下载当前文件按钮 */}
          {activeFilePath && (
            <IconButton
              size="sm"
              icon={<MyIcon name="common/downloadLine" w="16px" />}
              aria-label="Download"
              onClick={downloadCurrentFile}
              isLoading={downloadingFile}
              variant="whiteBase"
            />
          )}
          {/* 未保存标签和保存按钮 */}
          {activeFile?.isDirty && (
            <IconButton
              size="sm"
              icon={<MyIcon name="save" w="16px" />}
              aria-label="Save"
              onClick={() => saveFile()}
              isLoading={saving}
              variant="whiteBase"
            />
          )}
        </Flex>
      </Flex>

      {/* 编辑器 */}
      <Box flex={1} borderColor="myGray.200">
        {activeFile?.content === '[Binary File - Cannot Display]' ? (
          t('chat:sandbox_not_utf_file_tip')
        ) : (
          <Editor
            height="100%"
            language={activeFile?.language || 'plaintext'}
            value={activeFile?.content || ''}
            theme="vs-light"
            options={{
              minimap: { enabled: false },
              overviewRulerLanes: 0,
              overviewRulerBorder: false,
              fontSize: 13,
              lineNumbers: 'on',
              lineNumbersMinChars: 4,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              lineHeight: 20,
              fontFamily: "'Monaco', 'Menlo', 'Consolas', 'Courier New', monospace",
              tabSize: 2,
              wordWrap: 'on',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              renderLineHighlight: 'line',
              scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10
              }
            }}
            onMount={(editor, monaco) => {
              editorRef.current = editor;

              // 保存快捷键 Ctrl/Cmd + S
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                saveFile();
              });

              // 全部保存快捷键 Ctrl/Cmd + Shift + S
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS,
                () => {
                  // 保存所有未保存的文件
                  openedFiles.forEach((file) => {
                    if (file.isDirty) {
                      saveFile(file.path);
                    }
                  });
                }
              );
            }}
            onChange={(value) => {
              // 防止循环更新
              if (isUpdatingRef.current) return;

              // 更新当前文件内容
              if (activeFilePath && value !== undefined) {
                setOpenedFiles((prev) =>
                  prev.map((f) =>
                    f.path === activeFilePath ? { ...f, content: value, isDirty: true } : f
                  )
                );
              }
            }}
          />
        )}
      </Box>
    </Flex>
  );
};

export default EditorContent;
