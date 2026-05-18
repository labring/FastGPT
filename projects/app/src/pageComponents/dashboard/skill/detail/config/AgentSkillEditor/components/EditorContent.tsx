import React, { useState } from 'react';
import { Box, Flex, Center } from '@chakra-ui/react';
import Editor from '@monaco-editor/react';
import { useTranslation } from 'next-i18next';
import type { OpenedFile } from './FileTabs';
import Markdown from '@fastgpt/web/components/common/Markdown';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import MyPhotoView from '@fastgpt/web/components/common/Image/PhotoView';
import { getSupportsPreviewToggle } from '../utils';

type EditorInstance = Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0];

type Props = {
  activeFile: OpenedFile | undefined;
  activeFilePath: string;
  setOpenedFiles: React.Dispatch<React.SetStateAction<OpenedFile[]>>;
  editorRef: React.MutableRefObject<EditorInstance | undefined>;
  isUpdatingRef: React.MutableRefObject<boolean>;
  canWrite: boolean;
  scheduleAutoSave: (path: string, content: string) => void;
};

const EditorContent = ({
  activeFile,
  activeFilePath,
  setOpenedFiles,
  editorRef,
  isUpdatingRef,
  canWrite,
  scheduleAutoSave
}: Props) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'source' | 'preview'>('source');

  // 切换到新文件时根据语言重置 viewMode。用 react.dev 推荐的「render 阶段同步派生状态」
  // 模式（adjusting state during render），避免在 useEffect 里 setState 触发级联渲染。
  const [trackedPath, setTrackedPath] = useState(activeFilePath);
  if (trackedPath !== activeFilePath) {
    setTrackedPath(activeFilePath);
    setViewMode(getSupportsPreviewToggle(activeFile?.language) ? 'preview' : 'source');
  }

  const renderFileContent = () => {
    if (!activeFile) return null;

    if (activeFile.isUnknown) {
      return t('skill:editor_binary_file_no_preview');
    }

    if (activeFile.isBinary) {
      const { language, content, name } = activeFile;

      if (content.startsWith('blob:') && language === 'image') {
        return (
          <Box h="full" overflow="auto">
            <MyPhotoView src={content} alt={name} maxW="100%" objectFit="contain" />
          </Box>
        );
      }
      if (content.startsWith('blob:') && language === 'audio') {
        return (
          <Center h="full">
            <audio controls src={content}>
              Your browser does not support the audio element.
            </audio>
          </Center>
        );
      }
      if (content.startsWith('blob:') && language === 'video') {
        return (
          <Center h="full">
            <video controls src={content} style={{ maxWidth: '100%', maxHeight: '100%' }}>
              Your browser does not support the video element.
            </video>
          </Center>
        );
      }
      return t('skill:editor_binary_file_no_preview');
    }

    if (viewMode === 'preview') {
      const { language, content } = activeFile;
      if (language === 'markdown') {
        return (
          <Box h="full" overflowY="auto" bg="white">
            <Markdown source={content} />
          </Box>
        );
      }
      if (language === 'svg') {
        const svgUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
        return (
          <Box h="full" overflow="auto">
            <MyPhotoView src={svgUri} alt={activeFile.name} maxW="100%" objectFit="contain" />
          </Box>
        );
      }
    }

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
          readOnly: !canWrite,
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10
          }
        }}
        onMount={(editor) => {
          editorRef.current = editor;
        }}
        onChange={(value) => {
          if (isUpdatingRef.current) return;
          if (!canWrite) return;
          if (activeFilePath && value !== undefined) {
            setOpenedFiles((prev) =>
              prev.map((f) => (f.path === activeFilePath ? { ...f, content: value } : f))
            );
            scheduleAutoSave(activeFilePath, value);
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
      minH={0}
      h="100%"
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
          {getSupportsPreviewToggle(activeFile?.language) && (
            <FillRowTabs
              list={[
                { label: t('skill:editor_preview'), value: 'preview' },
                { label: t('skill:editor_source'), value: 'source' }
              ]}
              value={viewMode}
              onChange={(v) => setViewMode(v as 'source' | 'preview')}
              py="1"
              px="2"
              fontSize="xs"
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
