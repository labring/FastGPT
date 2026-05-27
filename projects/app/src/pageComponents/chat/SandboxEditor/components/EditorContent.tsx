import React, { useState } from 'react';
import { Box, Flex, IconButton, Center } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Editor from '@monaco-editor/react';
import { useTranslation } from 'next-i18next';
import { useLatest } from 'ahooks';
import type { OpenedFile } from './FileTabs';
import Markdown from '@fastgpt/web/components/common/Markdown';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyPhotoView from '@fastgpt/web/components/common/Image/PhotoView';
import { getHtmlPreviewLink } from '../api';
import { getSupportsPreviewToggle, parseMarkdownFrontmatter } from '../utils';
import MarkdownMetadataCard from './MarkdownMetadataCard';
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
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  showDownload?: boolean;
  defaultViewMode?: 'source' | 'preview';
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
  appId,
  chatId,
  outLinkAuthData,
  showDownload = true,
  defaultViewMode
}: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [viewModeByPath, setViewModeByPath] = useState<Record<string, 'source' | 'preview'>>({});
  const [generatingLink, setGeneratingLink] = useState(false);
  const openedFilesRef = useLatest(openedFiles);
  const supportsPreviewToggle = getSupportsPreviewToggle(activeFile?.language);
  const viewMode = supportsPreviewToggle
    ? (viewModeByPath[activeFilePath] ?? defaultViewMode ?? 'preview')
    : 'source';

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

    // 非媒体文件 UTF-8 解码失败 → 走兜底（如 xlsx/zip 等真二进制）
    if (activeFile.isUnknown) {
      return (
        <Box p={4} color="myGray.500" fontSize="sm">
          {t('chat:sandbox_binary_file_no_preview')}
        </Box>
      );
    }

    // 二二进制文件预览 (图片/音频/视频)
    if (activeFile.isBinary) {
      const { language, content, name } = activeFile;

      if (content.startsWith('blob:') && language === 'image') {
        return (
          <Box h="full" overflow="auto" p={4}>
            <MyPhotoView src={content} alt={name} maxW="100%" objectFit="contain" />
          </Box>
        );
      }

      if (content.startsWith('blob:') && language === 'audio') {
        return (
          <Center h="full">
            <audio controls src={content}>
              {t('chat:sandbox_audio_not_supported')}
            </audio>
          </Center>
        );
      }

      if (content.startsWith('blob:') && language === 'video') {
        return (
          <Center h="full">
            <video controls src={content} style={{ maxWidth: '100%', maxHeight: '100%' }}>
              {t('chat:sandbox_video_not_supported')}
            </video>
          </Center>
        );
      }

      // 无渲染器的二进制文件（如 PDF）
      return (
        <Box p={4} color="myGray.500" fontSize="sm">
          {t('chat:sandbox_binary_file_no_preview')}
        </Box>
      );
    }

    // 文本文件预览模式
    if (viewMode === 'preview') {
      const { language, content } = activeFile;
      if (language === 'markdown') {
        const { metadata, bodyContent, hasMetadata } = parseMarkdownFrontmatter(content);
        return (
          <Box h="full" overflowY="auto" bg="white" px={4} py={4}>
            {hasMetadata && <MarkdownMetadataCard metadata={metadata} />}
            <Markdown source={bodyContent} />
          </Box>
        );
      }
      if (language === 'svg') {
        const svgUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
        return (
          <Box h="full" overflow="auto" p={4}>
            <MyPhotoView src={svgUri} alt={activeFile.name} maxW="100%" objectFit="contain" />
          </Box>
        );
      }
    }

    // 文本文件源码模式 (Monaco Editor)
    return (
      <Box h="full" pt={2}>
        <Editor
          height="100%"
          language={activeFile.language || 'plaintext'}
          value={activeFile.content || ''}
          path={activeFile.path}
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
                openedFilesRef.current?.forEach((file) => {
                  if (file.isDirty) {
                    saveFile(file.path);
                  }
                });
              }
            );

            // 失去焦点时自动保存脏文件
            editor.onDidBlurEditorText(() => {
              const files = openedFilesRef.current;
              if (!files) return;
              const currentFile = files.find((f) => f.path === activeFilePath);
              if (currentFile?.isDirty) {
                saveFile(activeFilePath);
              }
            });
          }}
          onChange={(value) => {
            // 更新当前文件内容
            if (activeFilePath && value !== undefined && value !== activeFile?.content) {
              setOpenedFiles((prev) =>
                prev.map((f) =>
                  f.path === activeFilePath ? { ...f, content: value, isDirty: true } : f
                )
              );
            }
          }}
        />
      </Box>
    );
  };

  return (
    <Flex flex={'1 0 0'} flexDirection="column" bg={'white'} minH={0} h="100%">
      <Flex align="center" justify="space-between" px={4} h={'44px'}>
        <Flex align="center" gap={2}>
          <Box fontSize="14px" fontWeight="600" color="myGray.800">
            {activeFile?.name || ''}
          </Box>
          {activeFile && (
            <Flex alignItems={'center'} h={'20px'}>
              {activeFile.isDirty || saving ? (
                <Flex alignItems={'center'} gap={1} color={'myGray.500'} fontSize={'xs'}>
                  <MyIcon name={'common/loading'} w={'12px'} />
                  <Box>{t('common:core.app.saving')}</Box>
                </Flex>
              ) : (
                <MyTag py={0} px={1.5} showDot bg={'transparent'} colorSchema={'green'}>
                  {t('common:core.app.have_saved')}
                </MyTag>
              )}
            </Flex>
          )}
        </Flex>
        <Flex align="center" gap={2}>
          {/* HTML Preview Icon */}
          {activeFile?.language === 'html' && (
            <IconButton
              size="sm"
              icon={<MyIcon name="common/htmlPreview" w="16px" />}
              aria-label={t('chat:sandbox_html_preview')}
              isLoading={generatingLink}
              onClick={handleHtmlPreview}
              variant="whiteBase"
            />
          )}
          {/* Source/Preview Toggle Switch */}
          {supportsPreviewToggle && (
            <FillRowTabs
              list={[
                {
                  icon: 'visible',
                  iconSize: '16px',
                  label: '',
                  value: 'preview'
                },
                {
                  icon: 'common/edit',
                  iconSize: '14px',
                  label: '',
                  value: 'source'
                }
              ]}
              value={viewMode}
              onChange={(v) =>
                setViewModeByPath((prev) => ({
                  ...prev,
                  [activeFilePath]: v as 'source' | 'preview'
                }))
              }
              py="1"
              px="2.5"
              outerPadding="4px"
              outerHeight="40px"
              itemHeight="32px"
              fontSize="xs"
              iconSize="16px"
            />
          )}
          {showDownload && activeFilePath && (
            <IconButton
              size="sm"
              icon={<MyIcon name="common/downloadLine" w="16px" />}
              aria-label={t('chat:sandbox_download')}
              onClick={downloadCurrentFile}
              isLoading={downloadingFile}
              variant="whiteBase"
            />
          )}
        </Flex>
      </Flex>

      <Box flex={1} overflow="hidden" position="relative" zIndex={1} minH={0}>
        {renderFileContent()}
      </Box>
    </Flex>
  );
};

export default EditorContent;
