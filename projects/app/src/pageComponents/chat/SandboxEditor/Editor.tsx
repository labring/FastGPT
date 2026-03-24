import React, { useEffect, useState, useRef } from 'react';
import {
  Box,
  Center,
  Text,
  VStack,
  IconButton,
  Flex,
  Spinner,
  Input,
  InputGroup,
  InputLeftElement,
  Button
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import Editor from '@monaco-editor/react';
import { listSandboxFiles, readSandboxFile, writeSandboxFile, downloadSandbox } from './api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useMount } from 'ahooks';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { getIconByFilename } from './utils';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

type EditorInstance = Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0];

export type Props = {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
};

type FileItem = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
};

type TreeNode = FileItem & {
  children?: TreeNode[];
  level: number;
  loaded?: boolean; // 标记目录是否已加载
};

type OpenedFile = {
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
};

const SandboxEditor = ({ appId, chatId, outLinkAuthData }: Props) => {
  const { t } = useTranslation();
  const editorRef = useRef<EditorInstance>();
  const isUpdatingRef = useRef(false); // 防止循环更新

  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([]));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // 多标签页状态
  const [openedFiles, setOpenedFiles] = useState<OpenedFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('');

  const activeFile = useMemoEnhance(() => {
    return openedFiles.find((f) => f.path === activeFilePath);
  }, [openedFiles, activeFilePath]);

  // 加载目录 - 改为普通异步函数,避免 useRequest 的并发问题
  const { runAsync: loadDirectory } = useRequest(
    async (path: string, level: number) => {
      const data = await listSandboxFiles({ appId, chatId, outLinkAuthData, path });
      const nodes: TreeNode[] = (data.files || []).map((file) => ({
        ...file,
        level,
        children: file.type === 'directory' ? [] : undefined,
        loaded: false // 子目录初始未加载
      }));

      setFileTree((prevTree) => {
        if (level === 0) {
          return nodes;
        }
        // 更新目标节点,标记为已加载
        return updateTreeNode(prevTree, path, nodes, true);
      });

      return nodes;
    },
    {
      manual: true
    }
  );

  // 初始加载根目录的 loading 状态
  const [loadingRoot, setLoadingRoot] = useState(false);

  // 读取文件
  const { runAsync: loadFile, loading: loadingFile } = useRequest(
    async (filePath: string) => {
      const data = await readSandboxFile({ appId, chatId, outLinkAuthData, path: filePath });
      return data.content;
    },
    { manual: true }
  );

  // 保存文件
  const { run: saveFile, loading: saving } = useRequest(
    async (filePath?: string) => {
      const targetPath = filePath || activeFilePath;
      if (!targetPath) return;

      const targetFile = openedFiles.find((f) => f.path === targetPath);
      if (!targetFile) return;

      await writeSandboxFile({
        appId,
        chatId,
        outLinkAuthData,
        path: targetPath,
        content: targetFile.content
      });

      // 标记为已保存
      setOpenedFiles((prev) =>
        prev.map((f) => (f.path === targetPath ? { ...f, isDirty: false } : f))
      );
    },
    { manual: true }
  );

  // 下载工作区
  const { run: downloadWorkspace, loading: downloadingWorkspace } = useRequest(
    async () => {
      await downloadSandbox({ appId, chatId, outLinkAuthData });
    },
    { manual: true }
  );

  // 下载当前文件
  const { run: downloadCurrentFile, loading: downloadingFile } = useRequest(
    async () => {
      if (!activeFile) return;

      // 通过服务端下载接口获取原始文件,支持二进制文件(图片等)
      await downloadSandbox({ appId, chatId, outLinkAuthData, path: activeFile.path });
    },
    { manual: true }
  );

  // 获取文件语言
  const getLanguageByExtension = (ext?: string): string => {
    const langMap: Record<string, string> = {
      py: 'python',
      js: 'javascript',
      ts: 'typescript',
      jsx: 'javascript',
      tsx: 'typescript',
      json: 'json',
      md: 'markdown',
      html: 'html',
      css: 'css',
      scss: 'scss',
      less: 'less',
      sh: 'shell',
      bash: 'shell',
      yml: 'yaml',
      yaml: 'yaml',
      xml: 'xml',
      sql: 'sql',
      go: 'go',
      rs: 'rust',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp'
    };
    return langMap[ext?.toLowerCase() || ''] || 'plaintext';
  };

  // 打开文件
  const openFile = async (filePath: string) => {
    // 检查是否已打开
    const existingFile = openedFiles.find((f) => f.path === filePath);

    if (existingFile) {
      // 已打开,直接切换
      setActiveFilePath(filePath);
      return;
    }

    // 新打开文件
    try {
      const content = await loadFile(filePath);
      const fileName = filePath.split('/').pop() || '';
      const ext = fileName.split('.').pop();
      const language = getLanguageByExtension(ext);

      const newFile: OpenedFile = {
        path: filePath,
        name: fileName,
        content,
        language,
        isDirty: false
      };

      setOpenedFiles((prev) => [...prev, newFile]);
      setActiveFilePath(filePath);
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  // 关闭文件
  const closeFile = (filePath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const file = openedFiles.find((f) => f.path === filePath);

    // TODO: 如果有未保存的修改,提示用户
    // if (file?.isDirty) {
    //   // 显示确认对话框
    // }

    setOpenedFiles((prev) => prev.filter((f) => f.path !== filePath));

    // 如果关闭的是当前文件,切换到其他文件
    if (activeFilePath === filePath) {
      const remainingFiles = openedFiles.filter((f) => f.path !== filePath);
      if (remainingFiles.length > 0) {
        setActiveFilePath(remainingFiles[remainingFiles.length - 1].path);
      } else {
        setActiveFilePath('');
      }
    }
  };

  // 初始化加载根目录
  useMount(() => {
    setLoadingRoot(true);
    loadDirectory('.', 0).finally(() => {
      setLoadingRoot(false);
    });
  });

  // 当切换 tab 时,更新编辑器内容
  useEffect(() => {
    if (!editorRef.current || !activeFilePath) return;

    if (!activeFile) return;

    // 使用 ref 标记防止循环更新
    isUpdatingRef.current = true;
    editorRef.current.setValue(activeFile.content);

    // 延迟重置标记,确保 setValue 完成
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 0);
  }, [activeFilePath]);

  // 更新树节点
  const updateTreeNode = (
    tree: TreeNode[],
    targetPath: string,
    children: TreeNode[],
    loaded: boolean = false
  ): TreeNode[] => {
    return tree.map((node) => {
      if (node.path === targetPath) {
        return { ...node, children, loaded };
      }
      if (node.children) {
        return { ...node, children: updateTreeNode(node.children, targetPath, children, loaded) };
      }
      return node;
    });
  };

  // 切换目录展开/折叠
  const toggleDirectory = async (node: TreeNode) => {
    if (node.type !== 'directory') return;

    const isExpanded = expandedDirs.has(node.path);

    if (isExpanded) {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
    } else {
      // 如果未加载过,则加载
      if (!node.loaded) {
        // 添加 loading 状态
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.add(node.path);
          console.log('Add loading:', node.path, next);
          return next;
        });

        // 使用 Promise 确保 finally 一定执行
        loadDirectory(node.path, node.level + 1)
          .then(() => {
            // 加载成功,展开目录
            setExpandedDirs((prev) => {
              const next = new Set(prev);
              next.add(node.path);
              return next;
            });
          })
          .catch((error) => {
            console.error('Failed to load directory:', error);
          })
          .finally(() => {
            // 无论成功失败,都要移除 loading 状态
            setLoadingDirs((prev) => {
              const next = new Set(prev);
              next.delete(node.path);
              console.log('Remove loading:', node.path, next);
              return next;
            });
          });
      } else {
        // 已加载,直接展开
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(node.path);
          return next;
        });
      }
    }
  };

  // 过滤文件树
  const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query) return nodes;

    return nodes
      .map((node) => {
        if (node.type === 'file' && node.name.toLowerCase().includes(query.toLowerCase())) {
          return node;
        }
        if (node.children) {
          const filteredChildren = filterTree(node.children, query);
          if (filteredChildren.length > 0) {
            return { ...node, children: filteredChildren };
          }
        }
        return null;
      })
      .filter((node): node is TreeNode => node !== null);
  };

  // 渲染树节点
  const renderTreeNode = (node: TreeNode): React.ReactNode => {
    const isExpanded = expandedDirs.has(node.path);
    const isLoading = loadingDirs.has(node.path);
    const isActive = activeFile?.path === node.path;

    // 判断是否显示箭头:
    // 1. 必须是目录
    // 2. 未加载过 OR 已加载且有子节点
    const shouldShowArrow =
      node.type === 'directory' && (!node.loaded || (node.children && node.children.length > 0));

    return (
      <React.Fragment key={node.path}>
        <Flex
          pl={`${node.level * 16 + 4}px`}
          pr={2}
          py="6px"
          cursor="pointer"
          _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
          bg={isActive ? 'rgba(17, 24, 36, 0.05)' : 'transparent'}
          borderRadius="4px"
          onClick={() => {
            if (node.type === 'file') {
              openFile(node.path);
            } else {
              toggleDirectory(node);
            }
          }}
          align="center"
          fontSize="12px"
          color={isActive ? 'myGray.600' : 'myGray.600'}
        >
          <Flex justify="center" align="center" w="16px" h="16px">
            {shouldShowArrow ? (
              isLoading ? (
                <Spinner size="xs" color="primary.400" w="12px" h="12px" />
              ) : (
                <MyIcon
                  name={isExpanded ? 'core/chat/chevronDown' : 'core/chat/chevronRight'}
                  w="16px"
                  color="myGray.500"
                />
              )
            ) : null}
          </Flex>
          <MyIcon
            mr={1}
            ml={1}
            name={node.type === 'directory' ? 'common/folderFill' : getIconByFilename(node.name)}
            w="16px"
            color={node.type === 'directory' ? '#EF7623' : 'myGray.600'}
          />
          <Text
            flex={1}
            minW={0}
            noOfLines={1}
            overflow="hidden"
            textOverflow="ellipsis"
            fontWeight={isActive ? '500' : '500'}
            letterSpacing="0.5px"
          >
            {node.name}
          </Text>
        </Flex>
        {shouldShowArrow && isExpanded && node.children && node.children.map(renderTreeNode)}
      </React.Fragment>
    );
  };

  const filteredTree = filterTree(fileTree, searchQuery);

  return (
    <MyBox
      isLoading={loadingRoot && fileTree.length === 0}
      display={'flex'}
      h="full"
      w="full"
      bg="myGray.25"
      borderRadius="12px"
      overflow="hidden"
      border="1px solid"
      borderColor="myGray.200"
    >
      {fileTree.length > 0 ? (
        <>
          {/* 左侧: 文件浏览器 */}
          <Box
            flex="0 0 224px"
            w={0}
            borderRight="1px solid"
            borderColor="myGray.200"
            bg="myGray.25"
            display="flex"
            flexDirection="column"
          >
            {/* 搜索框 */}
            <Box p={3}>
              <InputGroup size="sm">
                <InputLeftElement h="32px">
                  <MyIcon name="common/searchLight" w="16px" color="myGray.500" />
                </InputLeftElement>
                <Input
                  placeholder={t('chat:sandbox_search_files')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  bg="white"
                  fontSize="12px"
                  h="32px"
                  borderRadius="6px"
                  borderColor="myGray.200"
                  _placeholder={{ color: 'myGray.500' }}
                />
              </InputGroup>
            </Box>

            {/* 文件树 */}
            <Box flex={1} overflowY="auto" overflowX="hidden" px={2}>
              <VStack align="stretch" spacing="0" pb={2}>
                {filteredTree.map(renderTreeNode)}
              </VStack>
            </Box>

            {/* 下载所有按钮 */}
            <Button
              m={2}
              variant={'unstyled'}
              bg={'myGray.150'}
              color={'primary.700'}
              fontSize={'12px'}
              fontWeight={'500'}
              leftIcon={<MyIcon name="common/downloadLine" w="16px" />}
              isLoading={downloadingWorkspace}
              onClick={downloadWorkspace}
              display={'flex'}
              alignItems={'center'}
              _disabled={{
                color: 'primary.700',
                bg: 'myGray.150',
                cursor: 'not-allowed',
                _hover: {
                  color: 'primary.700',
                  bg: 'myGray.150'
                }
              }}
            >
              {t('chat:download_all_files')}
            </Button>
          </Box>
          {/* 右侧: 编辑器区域 */}
          <MyBox
            isLoading={loadingFile}
            display={'flex'}
            flex={1}
            w={0}
            flexDirection="column"
            bg="myGray.25"
          >
            {openedFiles.length > 0 ? (
              <>
                {/* Tab 栏 */}
                <Box
                  flexShrink={0}
                  p={1}
                  bg="myGray.50"
                  borderRadius="md"
                  border="sm"
                  m={3}
                  mb={0}
                  overflowX="auto"
                  overflowY="hidden"
                  flexWrap="nowrap"
                  css={{
                    '&::-webkit-scrollbar': {
                      height: '6px'
                    },
                    '&::-webkit-scrollbar-thumb': {
                      background: '#E2E8F0',
                      borderRadius: '3px'
                    },
                    '&::-webkit-scrollbar-track': {
                      background: 'transparent'
                    }
                  }}
                >
                  <Flex gap={2} alignItems={'center'}>
                    {openedFiles.map((file) => {
                      const active = activeFilePath === file.path;
                      return (
                        <Flex
                          key={file.path}
                          px={3}
                          py={1}
                          h={'22px'}
                          bg={active ? 'white' : 'myGray.25'}
                          borderRadius="4px"
                          align="center"
                          gap={1}
                          fontSize="12px"
                          cursor="pointer"
                          onClick={() => setActiveFilePath(file.path)}
                          maxW="150px"
                          flexShrink={0}
                          position="relative"
                          boxShadow={'1.5'}
                          _hover={{
                            bg: active ? 'white' : 'myGray.50'
                          }}
                        >
                          <MyIcon name={getIconByFilename(file.name)} w="16px" color="myGray.600" />
                          <Text
                            flex={1}
                            noOfLines={1}
                            fontWeight={active ? '500' : '400'}
                            color={active ? 'primary.700' : 'myGray.500'}
                          >
                            {file.name}
                          </Text>
                          {file.isDirty && (
                            <Box w="6px" h="6px" borderRadius="50%" bg="yellow.600" />
                          )}
                          <MyIcon
                            name="common/closeLight"
                            w="16px"
                            color="myGray.500"
                            _hover={{
                              color: 'primary.500'
                            }}
                            onClick={(e) => closeFile(file.path, e)}
                          />
                        </Flex>
                      );
                    })}
                  </Flex>
                </Box>

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
                                f.path === activeFilePath
                                  ? { ...f, content: value, isDirty: true }
                                  : f
                              )
                            );
                          }
                        }}
                      />
                    )}
                  </Box>
                </Flex>
              </>
            ) : filteredTree.length > 0 ? (
              <Center h="full">
                <VStack spacing={3}>
                  <EmptyTip text={t('chat:sandbox_select_file_edit')} mt={0} />
                </VStack>
              </Center>
            ) : null}
          </MyBox>
        </>
      ) : !loadingRoot ? (
        <Center h="full" w={'full'}>
          <VStack spacing={3}>
            <EmptyTip text={t('chat:sandbox_no_file')} mt={0} />
          </VStack>
        </Center>
      ) : null}
    </MyBox>
  );
};

export default SandboxEditor;
