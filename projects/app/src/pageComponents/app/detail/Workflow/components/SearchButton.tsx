import React, { useState, useCallback } from 'react';
import { Box, Flex, Button, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowNodeEdgeContext } from '../../WorkflowComponents/context/workflowInitContext';
import { useReactFlow } from 'reactflow';
import { useDebounceEffect, useKeyPress } from 'ahooks';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';

const SearchButton = () => {
  const { t } = useTranslation();
  const setNodes = useContextSelector(WorkflowNodeEdgeContext, (state) => state.setNodes);
  const { fitView } = useReactFlow();

  const [keyword, setKeyword] = useState<string | null>(null);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchedNodeCount, setSearchedNodeCount] = useState(0);

  const isMac =
    typeof window !== 'undefined' && window.navigator.userAgent.toLocaleLowerCase().includes('mac');

  useKeyPress(['ctrl.f', 'meta.f'], (e) => {
    e.preventDefault();
    e.stopPropagation();
    setKeyword('');
  });

  useDebounceEffect(
    () => {
      if (!keyword) return;

      setNodes((nodes) => {
        const searchResult = nodes.filter((node) => {
          const nodeName = t(node.data.name as any);
          return nodeName.toLowerCase().includes(keyword.toLowerCase());
        });

        setSearchedNodeCount(searchResult.length);

        if (searchResult.length === 0 || searchIndex >= searchResult.length) {
          return nodes;
        }

        const searchedNode = searchResult[searchIndex];
        fitView({ nodes: [searchedNode] });

        return nodes.map((node) => ({
          ...node,
          selected: node.id === searchedNode.id
        }));
      });
    },
    [keyword, searchIndex],
    { wait: 500 }
  );

  const clearSearch = useCallback(() => {
    setKeyword(null);
    setSearchIndex(0);
    setSearchedNodeCount(0);
  }, []);

  const goToNextMatch = useCallback(() => {
    if (searchIndex === searchedNodeCount - 1) {
      setSearchIndex(0);
    } else {
      setSearchIndex((prev) => prev + 1);
    }
  }, [searchIndex, searchedNodeCount]);

  const goToPreviousMatch = useCallback(() => {
    if (searchIndex === 0) return;
    setSearchIndex((prev) => prev - 1);
  }, [searchIndex]);

  if (keyword === null) {
    return (
      <MyTooltip label={isMac ? t('workflow:find_tip_mac') : t('workflow:find_tip')}>
        <IconButton
          icon={<MyIcon name="common/searchLight" w="18px" />}
          aria-label=""
          size="sm"
          w="30px"
          variant="whitePrimary"
          onClick={() => setKeyword('')}
        />
      </MyTooltip>
    );
  }

  return (
    <MyBox position="relative">
      <SearchInput
        w="200px"
        pr={6}
        value={keyword}
        placeholder={t('workflow:please_enter_node_name')}
        autoFocus
        onBlur={() => {
          if (keyword) return;
          clearSearch();
        }}
        onChange={(e) => setKeyword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            goToNextMatch();
          }
        }}
      />

      {!!keyword && (
        <>
          <Flex
            position="absolute"
            top={1.5}
            left="176px"
            w="18px"
            h="18px"
            borderRadius="sm"
            _hover={{ bg: 'myGray.50' }}
            alignItems="center"
            justifyContent="center"
            cursor="pointer"
            onClick={clearSearch}
          >
            <MyIcon name="common/closeLight" w="14px" />
          </Flex>
          <MyBox
            position="absolute"
            top="34px"
            left={0}
            w="200px"
            h="40px"
            zIndex={10}
            bg="white"
            rounded="md"
            boxShadow="0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10)"
            px={1.5}
          >
            <Flex px={1} alignItems="center" h="full">
              {searchedNodeCount > 0 ? (
                <Flex alignItems="center" w="full" justifyContent="space-between">
                  <Box fontSize="12px" color="myGray.600">
                    {`${searchIndex + 1} / ${searchedNodeCount}`}
                  </Box>
                  <Flex>
                    <Button
                      size="xs"
                      fontSize="12px"
                      variant="ghost"
                      isDisabled={searchIndex === 0}
                      onClick={goToPreviousMatch}
                    >
                      {t('workflow:previous')}
                    </Button>
                    <Button
                      size="xs"
                      fontSize="12px"
                      variant="ghost"
                      isDisabled={searchIndex === searchedNodeCount - 1}
                      onClick={goToNextMatch}
                    >
                      {t('workflow:next')}
                    </Button>
                  </Flex>
                </Flex>
              ) : (
                <Flex fontSize="xs" color="myGray.600">
                  {t('workflow:no_node_found')}
                </Flex>
              )}
            </Flex>
          </MyBox>
        </>
      )}
    </MyBox>
  );
};

export default React.memo(SearchButton);
