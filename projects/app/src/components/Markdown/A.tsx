import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';
import {
  Button,
  Link,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  Box,
  Flex
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import { getQuoteData } from '@/web/core/dataset/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import Markdown from '.';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';

const A = ({ children, ...props }: any) => {
  const { t } = useTranslation();

  const {
    data: quoteData,
    loading,
    runAsync
  } = useRequest2(getQuoteData, {
    manual: true
  });

  // empty href link
  if (!props.href && typeof children?.[0] === 'string') {
    const text = useMemo(() => String(children), [children]);

    return (
      <MyTooltip label={t('common:core.chat.markdown.Quick Question')}>
        <Button
          variant={'whitePrimary'}
          size={'xs'}
          borderRadius={'md'}
          my={1}
          onClick={() => eventBus.emit(EventNameEnum.sendQuestion, { text })}
        >
          {text}
        </Button>
      </MyTooltip>
    );
  }

  // Quote
  if (props.href?.startsWith('QUOTE') && typeof children?.[0] === 'string') {
    const indexMatch = props.href.match(/QUOTE(\d+)/);
    const index = indexMatch ? indexMatch[1] : '1';

    const sourceData = useMemo(
      () => getCollectionSourceData(quoteData?.collection),
      [quoteData?.collection]
    );
    const icon = useMemo(
      () => getSourceNameIcon({ sourceId: sourceData.sourceId, sourceName: sourceData.sourceName }),
      [sourceData]
    );

    return (
      <Popover
        isLazy
        direction="rtl"
        placement="bottom"
        strategy={'fixed'}
        onOpen={() => runAsync(String(children))}
      >
        <PopoverTrigger>
          <Button variant={'unstyled'} minH={0} minW={0} h={'auto'}>
            <MyTooltip label={t('common:read_quote')}>
              <Box
                w={5}
                h={5}
                border={'1px solid'}
                borderRadius={'full'}
                borderColor={'myGray.200'}
                color={'myGray.500'}
                fontSize={'10px'}
                display={'flex'}
                alignItems={'center'}
                justifyContent={'center'}
                ml={0.5}
                transform={'translateY(-2px)'}
              >
                {index}
              </Box>
            </MyTooltip>
          </Button>
        </PopoverTrigger>
        <PopoverContent boxShadow={'lg'} w={'400px'} py={4}>
          <MyBox isLoading={loading} minH={'224px'}>
            <PopoverArrow />
            <PopoverBody
              px={4}
              py={0}
              fontSize={'sm'}
              maxW={'400px'}
              maxH={'224px'}
              overflow={'auto'}
            >
              <Box
                alignItems={'center'}
                fontSize={'xs'}
                border={'sm'}
                borderRadius={'sm'}
                overflow={'hidden'}
                display={'inline-flex'}
                height={6}
              >
                <Flex
                  color={'myGray.500'}
                  bg={'myGray.150'}
                  w={4}
                  justifyContent={'center'}
                  fontSize={'10px'}
                  h={'full'}
                  alignItems={'center'}
                  mr={1}
                  flexShrink={0}
                >
                  {index}
                </Flex>
                <Flex px={1.5}>
                  <MyIcon name={icon as any} mr={1} flexShrink={0} w={'12px'} />
                  <Box
                    className={'textEllipsis'}
                    wordBreak={'break-all'}
                    flex={'1 0 0'}
                    fontSize={'mini'}
                    color={'myGray.900'}
                  >
                    {sourceData.sourceName}
                  </Box>
                </Flex>
              </Box>
              <Box>
                <Markdown source={quoteData?.q} />
                {quoteData?.a && <Markdown source={quoteData?.a} />}
              </Box>
            </PopoverBody>
          </MyBox>
        </PopoverContent>
      </Popover>
    );
  }

  return <Link {...props}>{children}</Link>;
};

export default A;
