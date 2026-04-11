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
  Flex,
  useDisclosure,
  chakra
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import { getQuoteData } from '@/web/core/dataset/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import Markdown from '.';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import { isObjectId } from '@fastgpt/global/common/string/utils';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

export type AProps = {
  chatAuthData?: {
    appId: string;
    chatId: string;
    chatItemDataId: string;
  } & OutLinkChatAuthProps;
  onOpenCiteModal?: (e?: {
    collectionId?: string;
    sourceId?: string;
    sourceName?: string;
    datasetId?: string;
    quoteId?: string;
  }) => void;
  hideCiteIcon?: boolean;
  citeStyle?: 'icon' | 'index';
  citeIndexMap?: Map<string, number>;
};

const EmptyHrefLink = function EmptyHrefLink({ content }: { content: string }) {
  const { t } = useTranslation();
  return (
    <MyTooltip label={t('common:core.chat.markdown.Quick Question')}>
      <Button
        variant={'whitePrimary'}
        size={'xs'}
        borderRadius={'md'}
        my={1}
        onClick={() => eventBus.emit(EventNameEnum.sendQuestion, { text: content })}
      >
        {content}
      </Button>
    </MyTooltip>
  );
};

const CiteLinkIndex = React.memo(function CiteLinkIndex({
  id,
  index,
  chatAuthData
}: {
  id: string;
  index: number;
  chatAuthData?: AProps['chatAuthData'];
}) {
  const { loading, runAsync } = useRequest((id: string) => getQuoteData({ id, ...chatAuthData }), {
    manual: true
  });

  if (!isObjectId(id) || index === 0) {
    return <></>;
  }

  const handleClick = async () => {
    const data = await runAsync(id);
    if (data?.collection) {
      const { datasetId, _id: collectionId } = data.collection;
      window.open(
        `/dataset/detail?datasetId=${datasetId}&collectionId=${collectionId}&currentTab=dataCard`,
        '_blank'
      );
    }
  };

  return (
    <chakra.span
      display={'inline-flex'}
      alignItems={'center'}
      justifyContent={'center'}
      verticalAlign={'1px'}
      borderRadius={'50%'}
      bg={'#F0F2F5'}
      borderColor={'myGray.200'}
      px={'3px'}
      w={'16px'}
      h={'16px'}
      fontSize={'10px'}
      fontWeight={500}
      color={'#6C6F73'}
      mx={'2px'}
      cursor={loading ? 'wait' : 'pointer'}
      onClick={handleClick}
    >
      {index}
    </chakra.span>
  );
});

const CiteLinkIcon = React.memo(function CiteLinkIcon({
  id,
  chatAuthData,
  onOpenCiteModal,
  showAnimation
}: { id: string; showAnimation?: boolean } & AProps) {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const {
    data: datasetCiteData,
    loading,
    runAsync: getQuoteDataById
  } = useRequest((id: string) => getQuoteData({ id, ...chatAuthData }), {
    manual: true
  });
  const sourceData = useMemo(
    () => getCollectionSourceData(datasetCiteData?.collection),
    [datasetCiteData?.collection]
  );
  const icon = useMemo(
    () => getSourceNameIcon({ sourceId: sourceData.sourceId, sourceName: sourceData.sourceName }),
    [sourceData]
  );

  if (!isObjectId(id)) {
    return <></>;
  }

  return (
    <Popover
      isLazy
      direction="rtl"
      placement="bottom"
      strategy={'fixed'}
      isOpen={isOpen}
      onClose={onClose}
      onOpen={() => {
        onOpen();
        if (showAnimation) return;
        getQuoteDataById(id);
      }}
      trigger={'hover'}
      gutter={4}
    >
      <PopoverTrigger>
        <Button variant={'unstyled'} minH={0} minW={0} h={'auto'}>
          <MyIcon
            name={'core/chat/quoteSign'}
            w={'1rem'}
            color={'primary.700'}
            cursor={'pointer'}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent boxShadow={'lg'} w={'500px'} maxW={'90vw'} py={4}>
        <MyBox isLoading={loading || showAnimation}>
          <PopoverArrow />
          <PopoverBody py={0} px={0} fontSize={'sm'}>
            <Flex px={4} pb={1} justifyContent={'space-between'}>
              <Box
                alignItems={'center'}
                fontSize={'xs'}
                border={'sm'}
                borderRadius={'sm'}
                overflow={'hidden'}
                display={'inline-flex'}
                height={6}
                mr={1}
              >
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
              <Button
                variant={'ghost'}
                color={'primary.600'}
                size={'xs'}
                onClick={() => {
                  onClose();
                  onOpenCiteModal?.({
                    quoteId: id,
                    sourceId: sourceData.sourceId,
                    sourceName: sourceData.sourceName,
                    datasetId: datasetCiteData?.collection.datasetId,
                    collectionId: datasetCiteData?.collection._id
                  });
                }}
              >
                {t('common:all_quotes')}
              </Button>
            </Flex>
            <Box h={'300px'} overflow={'auto'} px={4}>
              <Markdown source={datasetCiteData?.q} />
              {datasetCiteData?.a && <Markdown source={datasetCiteData?.a} />}
            </Box>
          </PopoverBody>
        </MyBox>
      </PopoverContent>
    </Popover>
  );
});

const A = ({
  children,
  chatAuthData,
  onOpenCiteModal,
  showAnimation,
  hideCiteIcon,
  citeStyle,
  citeIndexMap,
  ...props
}: AProps & {
  children: any;
  showAnimation: boolean;
  [key: string]: any;
}) => {
  const content = useMemo(() => (children === undefined ? '' : String(children)), [children]);

  // empty href link
  if (!props.href && typeof children?.[0] === 'string') {
    return <EmptyHrefLink content={content} />;
  }

  // Cite
  if (
    (props.href?.startsWith('CITE') || props.href?.startsWith('QUOTE')) &&
    typeof content === 'string'
  ) {
    if (hideCiteIcon) return null;
    if (citeStyle === 'index') {
      return (
        <CiteLinkIndex
          id={content}
          index={citeIndexMap?.get(content) ?? 0}
          chatAuthData={chatAuthData}
        />
      );
    }
    return (
      <CiteLinkIcon
        id={content}
        chatAuthData={chatAuthData}
        onOpenCiteModal={onOpenCiteModal}
        showAnimation={showAnimation}
      />
    );
  }

  return <Link {...props}>{children || props?.href}</Link>;
};

export default React.memo(A);
