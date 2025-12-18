import React, { useState, useCallback, useRef } from 'react';
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
  useDisclosure,
  IconButton
} from '@chakra-ui/react';
import { useDebounceFn } from 'ahooks';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useTranslation } from 'next-i18next';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getKeywordQuote } from '@/web/core/app/api/log';
import type { GetKeywordQuoteResponse } from '@fastgpt/global/core/chat/correction/api';
import type { CorrectedQuoteItem } from '@fastgpt/global/core/chat/correction/type';

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
  const { isOpen, onOpen, onClose } = useDisclosure();
  const inputRef = useRef<HTMLInputElement>(null);

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
    },
    [debouncedSearch]
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
                  {knowledgeList.map((knowledge) => (
                    <Box
                      key={knowledge.datasetDataId}
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
                      cursor="pointer"
                      _hover={{
                        borderColor: selectedKnowledgeIds.includes(knowledge.datasetDataId)
                          ? 'primary.600'
                          : 'myGray.300'
                      }}
                      onClick={() => handleKnowledgeToggle(knowledge)}
                    >
                      <Flex align={'flex-start'} gap={3}>
                        <Box onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            isChecked={selectedKnowledgeIds.includes(knowledge.datasetDataId)}
                            onChange={() => handleKnowledgeToggle(knowledge)}
                            mt={0.5}
                          />
                        </Box>
                        <VStack align={'stretch'} spacing={2} flex={1}>
                          <Text fontWeight={500} fontSize={'14px'} color={'myGray.900'}>
                            {knowledge.q}
                          </Text>
                          <Text
                            fontSize={'12px'}
                            color={'myGray.500'}
                            whiteSpace="pre-wrap"
                            wordBreak="break-word"
                          >
                            {knowledge.a}
                          </Text>
                          <Flex align="center" gap={1}>
                            <MyIcon name="file/fill/file" w="14px" />
                            <Text fontSize={'12px'} color="#000">
                              {knowledge.sourceName}
                            </Text>
                          </Flex>
                        </VStack>
                      </Flex>
                    </Box>
                  ))}
                </VStack>
              </ScrollData>
            ) : null}
          </MyBox>
        </PopoverContent>
      </Popover>

      {/* 已选中的知识项列表 */}
      {correctedQuoteList.length > 0 && (
        <Box flex={1} overflowY="auto" mt={4}>
          <VStack spacing={2} align="stretch">
            {correctedQuoteList.map((knowledge) => (
              <Box
                key={knowledge.datasetDataId}
                px={3}
                py={4}
                border="1px solid"
                borderColor="transparent"
                borderRadius="md"
                transition="all 0.2s"
                _hover={{
                  borderColor: 'primary.500'
                }}
              >
                <Flex align={'center'} gap={4}>
                  <VStack align={'stretch'} spacing={2} flex={1}>
                    <Text fontWeight={500} fontSize={'14px'} color={'myGray.900'}>
                      {knowledge.q}
                    </Text>
                    <Text
                      fontSize={'12px'}
                      color={'myGray.500'}
                      whiteSpace="pre-wrap"
                      wordBreak="break-word"
                    >
                      {knowledge.a}
                    </Text>
                    <Flex align="center" gap={1}>
                      <MyIcon name="file/fill/file" w="14px" />
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
                    onClick={() => handleRemoveKnowledge(knowledge.datasetDataId)}
                  />
                </Flex>
              </Box>
            ))}
          </VStack>
        </Box>
      )}
    </Box>
  );
};

export default React.memo(KnowledgeSelect);
