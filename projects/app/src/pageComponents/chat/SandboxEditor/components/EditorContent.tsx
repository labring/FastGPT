import React, { useState } from 'react';
import { Box, Flex, IconButton, Center } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Editor from '@monaco-editor/react';
import { useTranslation } from 'next-i18next';
import type { OpenedFile } from './FileTabs';
import Markdown from '@fastgpt/web/components/common/Markdown';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import MyPhotoView from '@fastgpt/web/components/common/Image/PhotoView';
import { getHtmlPreviewLink } from '../api';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';

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
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
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
  isUpdatingRef,
  appId,
  chatId,
  outLinkAuthData
}: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'source' | 'preview'>('source');
  const [generatingLink, setGeneratingLink] = useState(false);

  const handleHtmlPreview = async () => {
    if (!activeFile) return;

    try {
      setGeneratingLink(true);
      const url = await getHtmlPreviewLink({
        appId,
        chatId,
        filePath: activeFile.path,
        outLinkAuthData
      });
      window.open(url, '_blank');
    } catch (error) {
      toast({
        title: t('chat:sandbox_html_preview_failed'),
        description: getErrText(error),
        status: 'error'
      });
    } finally {
      setGeneratingLink(false);
    }
  };

  const renderFileContent = () => {
    if (!activeFile) return null;

    // 二进制文件预览 (图片/音频/视频)
    if (activeFile.isBinary) {
      const { language, content, name } = activeFile;
      if (!content.startsWith('blob:')) return null;

      if (language === 'image') {
        return (
          <Center h="full" bg="myGray.50" borderRadius="md" p={4}>
            <Box position="relative" maxW="100%" maxH="100%">
              <MyPhotoView src={content} alt={name} maxW="100%" maxH="100%" objectFit="contain" />
            </Box>
          </Center>
        );
      }

      if (language === 'audio') {
        return (
          <Center h="full" bg="myGray.50" borderRadius="md">
            <audio controls src={content}>
              Your browser does not support the audio element.
            </audio>
          </Center>
        );
      }

      if (language === 'video') {
        return (
          <Center h="full" bg="myGray.50" borderRadius="md" p={4}>
            <video controls src={content} style={{ maxWidth: '100%', maxHeight: '100%' }}>
              Your browser does not support the video element.
            </video>
          </Center>
        );
      }

      return t('chat:sandbox_binary_file_no_preview');
    }

    // 文本文件预览模式
    if (viewMode === 'preview') {
      const { language, content } = activeFile;
      if (language === 'markdown') {
        return (
          <Box h="full" overflow="auto" bg="white">
            <Markdown source={content} />
          </Box>
        );
      }
      if (language === 'svg') {
        const svgUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
        return (
          <Center h="full" bg="myGray.50" borderRadius="md" p={4}>
            <Box position="relative" maxW="100%" maxH="100%">
              <MyPhotoView
                src={svgUri}
                alt={activeFile.name}
                maxW="100%"
                maxH="100%"
                objectFit="contain"
              />
            </Box>
          </Center>
        );
      }
    }

    // 文本文件源码模式 (Monaco Editor)
    return (
      <Editor
        height="100%"
        language={activeFile.language || 'plaintext'}
        value={activeFile.content || ''}
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
    );
  };

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
          {/* HTML Preview Icon */}
          {activeFile?.language === 'html' && (
            <IconButton
              size="sm"
              icon={<MyIcon name="common/htmlPreview" w="16px" />}
              aria-label={'Preview'}
              isLoading={generatingLink}
              onClick={handleHtmlPreview}
              variant="whiteBase"
            />
          )}
          {/* MD/SVG Toggle Preview Switch */}
          {(activeFile?.language === 'markdown' || activeFile?.language === 'svg') && (
            <FillRowTabs
              list={[
                { label: t('chat:sandbox_source'), value: 'source' },
                { label: t('chat:sandbox_preview'), value: 'preview' }
              ]}
              value={viewMode}
              onChange={(v) => setViewMode(v as 'source' | 'preview')}
              py="1"
              px="2"
              fontSize="xs"
            />
          )}
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

      <Box flex={1} borderColor="myGray.200" overflow="hidden">
        {renderFileContent()}
      </Box>
    </Flex>
  );
};

export default EditorContent;
