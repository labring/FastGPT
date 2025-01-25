import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';
import {
  Button,
  Link,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverArrow,
  PopoverCloseButton
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import { getQuoteData } from '@/web/core/dataset/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import RawSourceBox from '../core/dataset/RawSourceBox';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import Markdown from '.';

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
  if (props.href === 'QUOTE' && typeof children?.[0] === 'string') {
    return (
      <Popover
        direction="rtl"
        isLazy
        placement="auto"
        strategy={'fixed'}
        onOpen={() => runAsync(String(children))}
      >
        <PopoverTrigger>
          <Button variant={'unstyled'} minH={0} minW={0} h={'auto'}>
            <MyTooltip label={t('common:read_quote')}>
              <MyIcon
                name={'core/chat/quoteSign'}
                w={'1rem'}
                color={'primary.700'}
                cursor={'pointer'}
                transform={'translateY(-3px)'}
              />
            </MyTooltip>
          </Button>
        </PopoverTrigger>
        <PopoverContent boxShadow={'lg'} w={'400px'}>
          <MyBox isLoading={loading} minH={'300px'}>
            <PopoverArrow />
            <PopoverHeader h={'40px'} display={'flex'} alignItems={'center'}>
              {quoteData?.collection && (
                <RawSourceBox
                  collectionId={quoteData?.collection._id}
                  {...getCollectionSourceData(quoteData?.collection)}
                  fontSize={'sm'}
                  color={'black'}
                  textDecoration={'none'}
                />
              )}
              <PopoverCloseButton />
            </PopoverHeader>
            <PopoverBody fontSize={'sm'} maxH={'400px'} overflow={'auto'}>
              <Markdown source={quoteData?.q} />
              <Markdown source={quoteData?.a} />
            </PopoverBody>
          </MyBox>
        </PopoverContent>
      </Popover>
    );
  }

  return <Link {...props}>{children}</Link>;
};

export default A;
