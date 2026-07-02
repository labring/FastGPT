import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Checkbox, Flex, Input, type PlacementWithLogical } from '@chakra-ui/react';
import type { OpenApiTagType } from '@fastgpt/global/openapi/support/openapi/tag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';

const TagMultiSelect = ({
  tags,
  value,
  onChange,
  label,
  placeholder,
  onManage,
  onCreateTag,
  isLoading = false,
  showFooter = true,
  w = '180px',
  Trigger,
  renderTrigger,
  placement = 'bottom',
  popoverW = '180px',
  onClose
}: {
  tags: OpenApiTagType[];
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
  placeholder?: string;
  onManage?: () => void;
  onCreateTag?: (name: string) => Promise<OpenApiTagType | void>;
  isLoading?: boolean;
  showFooter?: boolean;
  w?: string | string[];
  Trigger?: React.ReactNode;
  renderTrigger?: (props: { openSelector: () => void }) => React.ReactNode;
  placement?: PlacementWithLogical;
  popoverW?: string;
  onClose?: (value: string[]) => void | Promise<void>;
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const latestValueRef = useRef(value);
  const tagsContainerRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const [openSelectorSignal, setOpenSelectorSignal] = useState(0);
  const [visibleSelectedTags, setVisibleSelectedTags] = useState<OpenApiTagType[]>([]);
  const [overflowSelectedTags, setOverflowSelectedTags] = useState<OpenApiTagType[]>([]);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const emitChange = (nextValue: string[]) => {
    latestValueRef.current = nextValue;
    onChange(nextValue);
  };

  const filteredTags = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return tags;

    return tags.filter((tag) => tag.name.toLowerCase().includes(keyword));
  }, [search, tags]);
  const selectedTags = useMemo(
    () => value.flatMap((id) => tags.find((tag) => tag._id === id) || []),
    [tags, value]
  );

  const calculateSelectedTagLayout = useCallback(() => {
    if (!tagsContainerRef.current || selectedTags.length === 0) {
      setVisibleSelectedTags(selectedTags);
      setOverflowSelectedTags([]);
      return;
    }

    const containerWidth = tagsContainerRef.current.offsetWidth;
    const tagGap = 4;
    const overflowIndicatorWidth = 34;
    const measureTagWidth = (tag: OpenApiTagType) => {
      const estimatedWidth = tag.name.length * 8 + 18;
      return Math.min(Math.max(estimatedWidth, 34), 96);
    };

    if (selectedTags.length === 1) {
      setVisibleSelectedTags(selectedTags);
      setOverflowSelectedTags([]);
      return;
    }

    let usedWidth = 0;
    let visibleCount = 0;

    for (let i = 0; i < selectedTags.length; i++) {
      const currentTagWidth = measureTagWidth(selectedTags[i]);
      const currentGap = i > 0 ? tagGap : 0;
      const remainingCount = selectedTags.length - i - 1;
      const overflowSpace = remainingCount > 0 ? overflowIndicatorWidth + tagGap : 0;

      if (usedWidth + currentTagWidth + currentGap + overflowSpace <= containerWidth) {
        usedWidth += currentTagWidth + currentGap;
        visibleCount = i + 1;
      } else {
        break;
      }
    }

    setVisibleSelectedTags(selectedTags.slice(0, Math.max(visibleCount, 1)));
    setOverflowSelectedTags(selectedTags.slice(Math.max(visibleCount, 1)));
  }, [selectedTags]);

  useEffect(() => {
    if (!tagsContainerRef.current || typeof ResizeObserver === 'undefined') {
      calculateSelectedTagLayout();
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(calculateSelectedTagLayout);
    });

    resizeObserver.observe(tagsContainerRef.current);
    requestAnimationFrame(calculateSelectedTagLayout);

    return () => {
      resizeObserver.disconnect();
    };
  }, [calculateSelectedTagLayout]);

  const onToggle = (tagId: string) => {
    const currentValue = latestValueRef.current;

    if (currentValue.includes(tagId)) {
      emitChange(currentValue.filter((id) => id !== tagId));
    } else {
      emitChange([...currentValue, tagId]);
    }
  };

  const onClickCreate = async () => {
    const name = search.trim();
    if (!name || !onCreateTag) return;

    const tag = await onCreateTag(name);
    const currentValue = latestValueRef.current;
    if (tag?._id && !currentValue.includes(tag._id)) {
      emitChange([...currentValue, tag._id]);
    }
    setSearch('');
  };

  const openSelector = useCallback(() => {
    setOpenSelectorSignal((signal) => signal + 1);
  }, []);

  useEffect(() => {
    if (openSelectorSignal === 0) return;

    triggerButtonRef.current?.click();
  }, [openSelectorSignal]);

  const defaultTrigger = (
    <Flex
      alignItems={'center'}
      px={3}
      py={2}
      w={w}
      borderRadius={'md'}
      border={'1px solid'}
      borderColor={'myGray.250'}
      bg={'white'}
      cursor={'pointer'}
      overflow={'hidden'}
      h={['28px', '36px']}
      fontSize={'sm'}
      _hover={{
        boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
        borderColor: 'primary.300'
      }}
    >
      {label && (
        <>
          <Box flexShrink={0} color={'myGray.600'}>
            {label}
          </Box>
          <Box mx={2} w={'1px'} h={'16px'} bg={'myGray.200'} flexShrink={0} />
        </>
      )}
      <Flex
        ref={tagsContainerRef}
        flex={'1 1 0'}
        minW={0}
        alignItems={'center'}
        gap={1}
        overflow={'hidden'}
      >
        {selectedTags.length === 0 ? (
          <Box overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
            {placeholder || t('account_apikey:tags')}
          </Box>
        ) : (
          <>
            {visibleSelectedTags.map((tag) => (
              <Flex
                key={tag._id}
                alignItems={'center'}
                h={5}
                px={2}
                bg={'white'}
                border={'base'}
                color={'myGray.900'}
                borderRadius={'sm'}
                fontSize={'xs'}
                flexShrink={0}
                maxW={'96px'}
                overflow={'hidden'}
              >
                <Box overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'} minW={0}>
                  {tag.name}
                </Box>
              </Flex>
            ))}
            {overflowSelectedTags.length > 0 && (
              <Flex
                alignItems={'center'}
                h={5}
                px={2}
                bg={'#1118240D'}
                borderRadius={'33px'}
                fontSize={'xs'}
                color={'myGray.600'}
                flexShrink={0}
              >
                {`+${overflowSelectedTags.length}`}
              </Flex>
            )}
          </>
        )}
      </Flex>
      <MyIcon name={'core/chat/chevronDown'} w={'14px'} flexShrink={0} />
    </Flex>
  );

  const triggerNode = renderTrigger ? (
    <Box
      as="button"
      ref={triggerButtonRef}
      type="button"
      w={'100%'}
      h={'100%'}
      p={0}
      border={0}
      opacity={0}
      pointerEvents={'none'}
    />
  ) : (
    Trigger || defaultTrigger
  );

  const selectorPopover = (
    <MyPopover
      placement={placement}
      hasArrow={false}
      offset={[2, 2]}
      w={popoverW}
      closeOnBlur
      trigger={'click'}
      onCloseFunc={() => {
        setSearch('');
        onClose?.(latestValueRef.current);
      }}
      Trigger={triggerNode}
    >
      {({ onClose }) => (
        <MyBox isLoading={isLoading} onClick={(e) => e.stopPropagation()}>
          <Box px={1.5} pt={1.5}>
            <Input
              pl={2}
              h={8}
              borderRadius={'xs'}
              value={search}
              placeholder={t('account_apikey:search_or_add_tag')}
              maxLength={50}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onClickCreate();
                }
              }}
            />
          </Box>

          <Box my={1} px={1.5} maxH={'240px'} overflow={'auto'}>
            {search.trim() && onCreateTag && !tags.some((tag) => tag.name === search.trim()) && (
              <Flex
                alignItems={'center'}
                fontSize={'sm'}
                px={1}
                cursor={'pointer'}
                _hover={{ bg: '#1118240D', color: 'primary.700' }}
                borderRadius={'xs'}
                onClick={onClickCreate}
              >
                <MyIcon name={'common/addLight'} w={'16px'} />
                <Box ml={2} py={2}>
                  {t('account_apikey:create_tag_with_name', {
                    name: search.trim()
                  })}
                </Box>
              </Flex>
            )}

            {filteredTags.length === 0 ? (
              <Box px={1} py={2} color={'myGray.500'} fontSize={'sm'}>
                {t('account_apikey:no_tags')}
              </Box>
            ) : (
              filteredTags.map((tag) => {
                const checked = value.includes(tag._id);

                return (
                  <Flex
                    alignItems={'center'}
                    fontSize={'sm'}
                    px={1}
                    py={1}
                    my={1}
                    cursor={'pointer'}
                    color={checked ? 'primary.700' : 'myGray.600'}
                    _hover={{
                      bg: '#1118240D',
                      color: 'primary.700',
                      ...(checked ? {} : { svg: { color: '#F3F3F4' } })
                    }}
                    borderRadius={'xs'}
                    key={tag._id}
                    onClick={(e) => {
                      e.preventDefault();
                      onToggle(tag._id);
                    }}
                  >
                    <Checkbox
                      isChecked={checked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggle(tag._id)}
                      size={'md'}
                      icon={<MyIcon name={'common/check'} w={'12px'} />}
                    />
                    <MyTooltip label={tag.name} showOnlyWhenOverflow>
                      <Box
                        ml={2}
                        overflow={'hidden'}
                        textOverflow={'ellipsis'}
                        whiteSpace={'nowrap'}
                      >
                        {tag.name}
                      </Box>
                    </MyTooltip>
                  </Flex>
                );
              })
            )}
          </Box>

          {showFooter && (
            <Flex borderTop={'1px solid #E8EBF0'} color={'myGray.600'}>
              <Button
                w={'full'}
                fontSize={'sm'}
                _hover={{ bg: '#1118240D', color: 'primary.700' }}
                borderRadius={'none'}
                borderBottomLeftRadius={'md'}
                variant={'unstyled'}
                onClick={() => {
                  setSearch('');
                  emitChange([]);
                  onClose();
                }}
              >
                {t('account_apikey:cancel_select')}
              </Button>
              <Box w={'1px'} bg={'myGray.200'} />
              <Button
                w={'full'}
                fontSize={'sm'}
                _hover={{ bg: '#1118240D', color: 'primary.700' }}
                borderRadius={'none'}
                borderBottomRightRadius={'md'}
                variant={'unstyled'}
                onClick={() => {
                  onManage?.();
                  onClose();
                }}
              >
                {t('account_apikey:tag_manage')}
              </Button>
            </Flex>
          )}
        </MyBox>
      )}
    </MyPopover>
  );

  if (renderTrigger) {
    return (
      <Box position={'relative'} w={'100%'}>
        {renderTrigger({ openSelector })}
        <Box position={'absolute'} inset={0} pointerEvents={'none'}>
          {selectorPopover}
        </Box>
      </Box>
    );
  }

  return selectorPopover;
};

export default React.memo(TagMultiSelect);
