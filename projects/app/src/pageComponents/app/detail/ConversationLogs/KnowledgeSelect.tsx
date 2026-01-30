import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Box,
  Input,
  InputGroup,
  InputLeftElement,
  VStack,
  Text,
  Checkbox,
  Flex,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  useDisclosure,
  IconButton,
  useOutsideClick
} from '@chakra-ui/react';
import { useDebounceFn } from 'ahooks';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import HighlightText from '@fastgpt/web/components/common/String/HighlightText';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getKeywordQuote } from '@/web/core/app/api/log';
import type { GetKeywordQuoteResponse } from '@fastgpt/global/core/chat/correction/api';
import type { CorrectedQuoteItem } from '@fastgpt/global/core/chat/correction/type';
import Markdown from '@/components/Markdown';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';

// 悬浮层 Markdown 内容的缩放样式
const popoverMarkdownStyles = {
  '& .markdown': { fontSize: '13px' },
  '& .markdown p': { fontSize: '13px', lineHeight: '1.5', margin: '6px 0' },
  '& .markdown h1, & .markdown h2, & .markdown h3, & .markdown h4, & .markdown h5, & .markdown h6':
    {
      fontSize: '14px',
      lineHeight: '1.5',
      margin: '8px 0 6px'
    },
  '& .markdown ul, & .markdown ol': { fontSize: '13px', paddingLeft: '18px', margin: '6px 0' },
  '& .markdown li': { margin: '3px 0' },
  '& .markdown code': { fontSize: '12px', padding: '2px 4px' },
  '& .markdown pre': { fontSize: '12px', padding: '8px', margin: '6px 0' },
  '& .markdown table': { fontSize: '12px', width: '100%' },
  '& .markdown table th': { fontSize: '12px', padding: '4px 8px' },
  '& .markdown table td': { fontSize: '12px', padding: '4px 8px' },
  '& .markdown blockquote': { fontSize: '13px', padding: '0 10px' },
  '& .markdown dl': { fontSize: '13px' },
  '& .markdown dl dt': { fontSize: '13px', margin: '10px 0 4px' },
  '& .markdown dl dd': { fontSize: '13px', margin: '0 0 10px', padding: '0 10px' }
};

interface KnowledgeSelectProps {
  correctedQuoteList: CorrectedQuoteItem[];
  onCorrectedQuoteListChange: (correctedQuoteList: CorrectedQuoteItem[]) => void;
  appId: string;
  chatId: string;
  datasetIds: string[];
}

const KnowledgeSelect = ({
  correctedQuoteList,
  onCorrectedQuoteListChange,
  appId,
  chatId,
  datasetIds
}: KnowledgeSelectProps) => {
  const { t } = useTranslation();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [hoveredKnowledgeId, setHoveredKnowledgeId] = useState<string | null>(null);
  const [hoveredSelectedItem, setHoveredSelectedItem] = useState<string | null>(null);
  const [hoveredSelectedItemForPopover, setHoveredSelectedItemForPopover] = useState<string | null>(
    null
  );
  const { isOpen, onOpen, onClose } = useDisclosure();
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectedItemHoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectedItemCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 手动控制悬浮显示
  const handleMouseEnter = useCallback((knowledgeId: string) => {
    // 清除之前的关闭定时器
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    // 设置打开定时器(延迟100ms)
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredKnowledgeId(knowledgeId);
    }, 100);
  }, []);

  // 手动控制悬浮隐藏
  const handleMouseLeave = useCallback(() => {
    // 清除打开定时器
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // 设置关闭定时器(延迟200ms)
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredKnowledgeId(null);
      // 悬浮内容关闭后,焦点短暂返回搜索框后立即失焦,防止下拉列表滚动
      // 但只有在搜索框未聚焦时才执行此逻辑
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
        inputRef.current?.blur();
      }
    }, 200);
  }, []);

  // 当悬浮内容本身被鼠标进入时,取消关闭
  const handlePopoverMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  // 当悬浮内容本身被鼠标离开时,延迟200ms关闭
  const handlePopoverMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // 设置关闭定时器(延迟200ms)
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredKnowledgeId(null);
      // 悬浮内容关闭后,焦点短暂返回搜索框后立即失焦,防止下拉列表滚动
      // 但只有在搜索框未聚焦时才执行此逻辑
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
        inputRef.current?.blur();
      }
    }, 200);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      if (selectedItemHoverTimeoutRef.current) {
        clearTimeout(selectedItemHoverTimeoutRef.current);
      }
      if (selectedItemCloseTimeoutRef.current) {
        clearTimeout(selectedItemCloseTimeoutRef.current);
      }
    };
  }, []);

  // 手动控制已选中项悬浮显示
  const handleSelectedItemMouseEnter = useCallback((knowledgeId: string) => {
    // 清除之前的关闭定时器
    if (selectedItemCloseTimeoutRef.current) {
      clearTimeout(selectedItemCloseTimeoutRef.current);
      selectedItemCloseTimeoutRef.current = null;
    }

    // 设置打开定时器(延迟100ms)
    if (selectedItemHoverTimeoutRef.current) {
      clearTimeout(selectedItemHoverTimeoutRef.current);
    }
    selectedItemHoverTimeoutRef.current = setTimeout(() => {
      setHoveredSelectedItemForPopover(knowledgeId);
    }, 100);
  }, []);

  // 手动控制已选中项悬浮隐藏
  const handleSelectedItemMouseLeave = useCallback(() => {
    // 清除打开定时器
    if (selectedItemHoverTimeoutRef.current) {
      clearTimeout(selectedItemHoverTimeoutRef.current);
      selectedItemHoverTimeoutRef.current = null;
    }

    // 设置关闭定时器(延迟200ms)
    selectedItemCloseTimeoutRef.current = setTimeout(() => {
      setHoveredSelectedItemForPopover(null);
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
        inputRef.current?.blur();
      }
    }, 200);
  }, []);

  // 当已选中项悬浮内容本身被鼠标进入时,取消关闭
  const handleSelectedItemPopoverMouseEnter = useCallback(() => {
    if (selectedItemCloseTimeoutRef.current) {
      clearTimeout(selectedItemCloseTimeoutRef.current);
      selectedItemCloseTimeoutRef.current = null;
    }
  }, []);

  // 当已选中项悬浮内容本身被鼠标离开时,延迟200ms关闭
  const handleSelectedItemPopoverMouseLeave = useCallback(() => {
    if (selectedItemHoverTimeoutRef.current) {
      clearTimeout(selectedItemHoverTimeoutRef.current);
      selectedItemHoverTimeoutRef.current = null;
    }
    // 设置关闭定时器(延迟200ms)
    selectedItemCloseTimeoutRef.current = setTimeout(() => {
      setHoveredSelectedItemForPopover(null);
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
        inputRef.current?.blur();
      }
    }, 200);
  }, []);

  // 点击外部关闭下拉列表(但排除悬浮内容区域)
  useOutsideClick({
    ref: popoverRef,
    handler: () => {
      // 如果悬浮内容正在显示,不关闭下拉列表
      if (!hoveredKnowledgeId) {
        onClose();
      }
    }
  });

  // 防抖搜索
  const { run: debouncedSearch } = useDebounceFn(
    (value: string) => {
      setSearchKeyword(value);
    },
    { wait: 500 }
  );

  // 处理搜索输入
  const handleSearch = useCallback(
    (value: string) => {
      debouncedSearch(value);
      // 如果输入框聚焦且有内容，确保 Popover 是打开的
      if (inputRef.current === document.activeElement && !isOpen) {
        onOpen();
      }
    },
    [debouncedSearch, isOpen, onOpen]
  );

  // 处理搜索框点击事件，阻止浮层关闭
  const handleInputClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isOpen) {
        onOpen();
      }
    },
    [isOpen, onOpen]
  );

  // 获取知识列表
  const {
    ScrollData,
    data: knowledgeList = [],
    isLoading
  } = useScrollPagination<
    { keyword: string; offset: number; pageSize: number },
    GetKeywordQuoteResponse
  >(
    async ({ offset, pageSize }) => {
      if (!searchKeyword?.trim() || searchKeyword.trim().length < 2) {
        return { list: [], total: 0 };
      }

      const result = await getKeywordQuote({
        appId,
        chatId,
        keyword: searchKeyword,
        datasetIds,
        offset: Number(offset),
        pageSize: Number(pageSize)
      });
      return result;
    },
    {
      pageSize: 20,
      refreshDeps: [searchKeyword, appId, chatId, datasetIds]
    }
  );

  // 处理知识选择
  const handleKnowledgeToggle = useCallback(
    (knowledge: GetKeywordQuoteResponse['list'][0]) => {
      const existingIndex = correctedQuoteList.findIndex(
        (item) => item.datasetDataId === knowledge.datasetDataId
      );

      let newCorrectedQuoteList: CorrectedQuoteItem[];

      if (existingIndex >= 0) {
        // 如果已存在，则移除
        newCorrectedQuoteList = correctedQuoteList.filter(
          (item) => item.datasetDataId !== knowledge.datasetDataId
        );
      } else {
        // 如果不存在，则添加
        const newQuoteItem: CorrectedQuoteItem = {
          datasetDataId: knowledge.datasetDataId,
          q: knowledge.q,
          a: knowledge.a || '',
          sourceName: knowledge.sourceName || ''
        };
        newCorrectedQuoteList = [...correctedQuoteList, newQuoteItem];
      }

      onCorrectedQuoteListChange(newCorrectedQuoteList);
    },
    [correctedQuoteList, onCorrectedQuoteListChange]
  );

  // 处理删除已选知识
  const handleRemoveKnowledge = useCallback(
    (knowledgeId: string) => {
      const newCorrectedQuoteList = correctedQuoteList.filter(
        (item) => item.datasetDataId !== knowledgeId
      );
      onCorrectedQuoteListChange(newCorrectedQuoteList);
    },
    [correctedQuoteList, onCorrectedQuoteListChange]
  );

  // 获取已选中的知识项 ID 列表用于判断选中状态
  const selectedKnowledgeIds = correctedQuoteList.map((item) => item.datasetDataId);

  // 判断知识项是否是 FAQ（同时有 q 和 a）
  const isFAQ = useCallback((knowledge: { q: string; a?: string }) => {
    return !!(knowledge.q && knowledge.a);
  }, []);

  // 检查已选列表中是否有 FAQ
  const hasSelectedFAQ = useMemo(() => {
    return correctedQuoteList.some((item) => isFAQ(item));
  }, [correctedQuoteList, isFAQ]);

  // 判断某个知识项是否应该被禁用
  const isKnowledgeDisabled = useCallback(
    (knowledge: GetKeywordQuoteResponse['list'][0]) => {
      // 如果当前知识项已经被选中，则不禁用
      if (selectedKnowledgeIds.includes(knowledge.datasetDataId)) {
        return false;
      }
      // 如果当前知识项是 FAQ，且已经选择了其他 FAQ，则禁用
      if (isFAQ(knowledge) && hasSelectedFAQ) {
        return true;
      }
      return false;
    },
    [selectedKnowledgeIds, isFAQ, hasSelectedFAQ]
  );

  // 获取已选中卡片的样式
  const getSelectedCardStyles = (itemId: string) => {
    const isHovered = hoveredSelectedItem === itemId;
    return {
      border: '1px solid',
      borderColor: isHovered ? 'primary.600' : 'transparent',
      borderBottomColor: isHovered ? 'primary.600' : 'myGray.200',
      shadow: isHovered ? 'sm' : 'none',
      borderRadius: isHovered ? '8px' : '0',
      px: 3,
      py: 4,
      cursor: 'pointer',
      transition: 'all 0.2s'
    };
  };

  return (
    <Box
      border="1px solid"
      borderColor="myGray.200"
      borderRadius="md"
      bg="white"
      p={4}
      h="306px"
      display="flex"
      flexDirection="column"
    >
      <Popover
        isOpen={isOpen}
        onClose={onClose}
        placement="bottom-start"
        matchWidth
        initialFocusRef={inputRef}
        closeOnBlur={false}
        closeOnEsc={true}
      >
        <PopoverTrigger>
          <Box>
            <InputGroup>
              <InputLeftElement>
                <MyIcon name={'common/searchLight'} w={'16px'} color={'myGray.500'} />
              </InputLeftElement>
              <Input
                ref={inputRef}
                placeholder={t('app:knowledge_select_search_placeholder')}
                onChange={(e) => handleSearch(e.target.value)}
                onClick={handleInputClick}
                bg={'white'}
                border="1px solid"
                borderColor="myGray.200"
              />
            </InputGroup>
          </Box>
        </PopoverTrigger>
        <PopoverContent
          ref={popoverRef}
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="md"
          w="100%"
          boxShadow="0px 32px 64px -12px rgba(19, 51, 107, 0.2), 0px 0px 1px 0px rgba(19, 51, 107, 0.2)"
        >
          <MyBox h="230px" isLoading={isLoading && searchKeyword !== ''}>
            {!searchKeyword ? (
              <Flex h="100%" alignItems="center" justifyContent="center">
                <EmptyTip
                  text={t('app:knowledge_search_input_tip')}
                  pt="20px"
                  pb="40px"
                  iconSize="32px"
                />
              </Flex>
            ) : !isLoading && knowledgeList.length === 0 ? (
              <Flex h="100%" alignItems="center" justifyContent="center">
                <EmptyTip
                  text={t('app:knowledge_search_no_results')}
                  pt="20px"
                  pb="40px"
                  iconSize="32px"
                />
              </Flex>
            ) : !isLoading && knowledgeList.length > 0 ? (
              <ScrollData h="230px" overflowY="auto" p={3}>
                <VStack spacing={1.5} align="stretch">
                  {knowledgeList.map((knowledge) => {
                    const isDisabled = isKnowledgeDisabled(knowledge);
                    const knowledgeItem = (
                      <Popover
                        key={knowledge.datasetDataId}
                        isOpen={hoveredKnowledgeId === knowledge.datasetDataId}
                        placement="right"
                        closeOnBlur={false}
                        isLazy
                        lazyBehavior="unmount"
                        returnFocusOnClose={false}
                        autoFocus={false}
                      >
                        <PopoverTrigger>
                          <Box
                            p={4}
                            border="1px solid"
                            borderColor={
                              selectedKnowledgeIds.includes(knowledge.datasetDataId)
                                ? 'primary.500'
                                : 'myGray.200'
                            }
                            borderRadius="md"
                            bg={
                              selectedKnowledgeIds.includes(knowledge.datasetDataId)
                                ? 'primary.50'
                                : 'white'
                            }
                            cursor={isDisabled ? 'not-allowed' : 'pointer'}
                            opacity={isDisabled ? 0.5 : 1}
                            _hover={
                              isDisabled
                                ? {}
                                : {
                                    borderColor: selectedKnowledgeIds.includes(
                                      knowledge.datasetDataId
                                    )
                                      ? 'primary.600'
                                      : 'myGray.300'
                                  }
                            }
                            onClick={() => !isDisabled && handleKnowledgeToggle(knowledge)}
                            onMouseEnter={() =>
                              !isDisabled && handleMouseEnter(knowledge.datasetDataId)
                            }
                            onMouseLeave={handleMouseLeave}
                          >
                            <Flex align={'flex-start'} gap={3}>
                              <Box onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  isChecked={selectedKnowledgeIds.includes(knowledge.datasetDataId)}
                                  onChange={() => !isDisabled && handleKnowledgeToggle(knowledge)}
                                  isDisabled={isDisabled}
                                  mt={0.5}
                                />
                              </Box>
                              <VStack align={'stretch'} spacing={2} flex={1}>
                                {knowledge.a ? (
                                  <>
                                    <Text
                                      fontSize={'12px'}
                                      color={'myGray.500'}
                                      className={'textEllipsis'}
                                    >
                                      <HighlightText
                                        rawText={knowledge.q}
                                        matchText={searchKeyword}
                                        mode={'text'}
                                      />
                                    </Text>
                                    <Box h="1px" bg="myGray.200" my="4px" />
                                    <Text
                                      fontSize={'12px'}
                                      color={'myGray.500'}
                                      className={'textEllipsis2'}
                                    >
                                      <HighlightText
                                        rawText={knowledge.a}
                                        matchText={searchKeyword}
                                        mode={'text'}
                                      />
                                    </Text>
                                  </>
                                ) : (
                                  <Text
                                    fontSize={'12px'}
                                    color={'myGray.500'}
                                    className={'textEllipsis3'}
                                  >
                                    <HighlightText
                                      rawText={knowledge.extractiveText || knowledge.q}
                                      matchText={searchKeyword}
                                      mode={'text'}
                                    />
                                  </Text>
                                )}
                                <Flex align="center" gap={1}>
                                  <MyIcon
                                    name={
                                      getSourceNameIcon({
                                        sourceName: knowledge.sourceName || ''
                                      }) as any
                                    }
                                    w="14px"
                                  />
                                  <Text fontSize={'12px'} color="#000">
                                    {knowledge.sourceName}
                                  </Text>
                                </Flex>
                              </VStack>
                            </Flex>
                          </Box>
                        </PopoverTrigger>
                        <PopoverContent
                          border="1px solid"
                          borderColor="myGray.200"
                          borderRadius="md"
                          boxShadow="0px 4px 12px rgba(0, 0, 0, 0.15)"
                          bg="white"
                          onMouseEnter={handlePopoverMouseEnter}
                          onMouseLeave={handlePopoverMouseLeave}
                        >
                          <PopoverBody p={3} maxH="400px" overflowY="auto">
                            <VStack align="stretch" spacing={2}>
                              {knowledge.a ? (
                                <>
                                  <Box fontSize="xs" sx={popoverMarkdownStyles}>
                                    <Markdown source={knowledge.q} />
                                    <Markdown source={knowledge.a} />
                                  </Box>
                                </>
                              ) : (
                                <Box fontSize="xs" sx={popoverMarkdownStyles}>
                                  <Markdown source={knowledge.q} />
                                </Box>
                              )}
                            </VStack>
                          </PopoverBody>
                        </PopoverContent>
                      </Popover>
                    );

                    // 如果被禁用，用 MyTooltip 包裹
                    if (isDisabled) {
                      return (
                        <MyTooltip
                          key={knowledge.datasetDataId}
                          label={t('app:knowledge_faq_limit_tip')}
                        >
                          {knowledgeItem}
                        </MyTooltip>
                      );
                    }

                    return knowledgeItem;
                  })}
                </VStack>
              </ScrollData>
            ) : null}
          </MyBox>
        </PopoverContent>
      </Popover>

      {/* 已选中的知识项列表 */}
      {correctedQuoteList.length > 0 && (
        <Box flex={1} overflowY="auto" mt={4}>
          <VStack spacing={0} align="stretch">
            {correctedQuoteList.map((knowledge) => (
              <Popover
                key={knowledge.datasetDataId}
                isOpen={!isOpen && hoveredSelectedItemForPopover === knowledge.datasetDataId}
                placement="right"
                closeOnBlur={false}
                isLazy
                lazyBehavior="unmount"
                returnFocusOnClose={false}
                autoFocus={false}
              >
                <PopoverTrigger>
                  <Box
                    {...getSelectedCardStyles(knowledge.datasetDataId)}
                    onMouseEnter={() => {
                      setHoveredSelectedItem(knowledge.datasetDataId);
                      handleSelectedItemMouseEnter(knowledge.datasetDataId);
                    }}
                    onMouseLeave={() => {
                      setHoveredSelectedItem(null);
                      handleSelectedItemMouseLeave();
                    }}
                  >
                    <Flex align={'center'} gap={4}>
                      <VStack align={'stretch'} spacing={2} flex={1}>
                        {knowledge.a ? (
                          <>
                            <Text fontSize={'12px'} color={'myGray.500'} className={'textEllipsis'}>
                              {knowledge.q}
                            </Text>
                            <Box h="1px" bg="myGray.200" my="4px" />
                            <Text
                              fontSize={'12px'}
                              color={'myGray.500'}
                              className={'textEllipsis2'}
                              mb="8px"
                            >
                              {knowledge.a}
                            </Text>
                          </>
                        ) : (
                          <Text fontSize={'12px'} color={'myGray.500'} className={'textEllipsis3'}>
                            {knowledge.q}
                          </Text>
                        )}
                        <Flex align="center" gap={1}>
                          <MyIcon
                            name={
                              getSourceNameIcon({
                                sourceName: knowledge.sourceName || ''
                              }) as any
                            }
                            w="14px"
                          />
                          <Text fontSize={'12px'} color="#000">
                            {knowledge.sourceName}
                          </Text>
                        </Flex>
                      </VStack>
                      <IconButton
                        aria-label="delete"
                        size={'mdSquare'}
                        variant={'whiteDanger'}
                        icon={<MyIcon name={'delete'} w={4} />}
                        opacity={hoveredSelectedItem === knowledge.datasetDataId ? 1 : 0}
                        visibility={
                          hoveredSelectedItem === knowledge.datasetDataId ? 'visible' : 'hidden'
                        }
                        transition="all 0.2s"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveKnowledge(knowledge.datasetDataId);
                        }}
                      />
                    </Flex>
                  </Box>
                </PopoverTrigger>
                <PopoverContent
                  border="1px solid"
                  borderColor="myGray.200"
                  borderRadius="md"
                  boxShadow="0px 4px 12px rgba(0, 0, 0, 0.15)"
                  bg="white"
                  onMouseEnter={handleSelectedItemPopoverMouseEnter}
                  onMouseLeave={handleSelectedItemPopoverMouseLeave}
                >
                  <PopoverBody p={3} maxH="400px" overflowY="auto">
                    <VStack align="stretch" spacing={2}>
                      {knowledge.a ? (
                        <>
                          <Box fontSize="xs" sx={popoverMarkdownStyles}>
                            <Markdown source={knowledge.q} />
                            <Markdown source={knowledge.a} />
                          </Box>
                        </>
                      ) : (
                        <Box fontSize="xs" sx={popoverMarkdownStyles}>
                          <Markdown source={knowledge.q} />
                        </Box>
                      )}
                    </VStack>
                  </PopoverBody>
                </PopoverContent>
              </Popover>
            ))}
          </VStack>
        </Box>
      )}
    </Box>
  );
};

export default React.memo(KnowledgeSelect);
