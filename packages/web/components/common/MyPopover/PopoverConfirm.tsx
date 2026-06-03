import React from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '../Icon';
import { useRequest } from '../../../hooks/useRequest';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  useDisclosure,
  type PlacementWithLogical,
  HStack,
  Box,
  Button,
  PopoverArrow,
  Flex
} from '@chakra-ui/react';
import { useMemoEnhance } from '../../../hooks/useMemoEnhance';

const PopoverConfirm = ({
  content,
  showCancel = true,
  type,
  Trigger,
  placement = 'auto',
  offset,
  onConfirm,
  confirmText,
  cancelText
}: {
  content: string;
  showCancel?: boolean;
  type?: 'info' | 'delete';
  Trigger: React.ReactNode;
  placement?: PlacementWithLogical;
  offset?: [number, number];
  onConfirm: () => Promise<any> | any;
  confirmText?: string;
  cancelText?: string;
}) => {
  const { t } = useTranslation();

  const map = useMemoEnhance(() => {
    const map = {
      info: {
        variant: 'primary',
        icon: 'common/confirm/infoTipClean'
      },
      delete: {
        variant: 'dangerFill',
        icon: 'common/confirm/deleteTip'
      }
    };
    if (type && map[type]) return map[type];
    return map.info;
  }, [type]);

  const firstFieldRef = React.useRef(null);
  const { onOpen, onClose, isOpen } = useDisclosure();

  const { runAsync: onclickConfirm, loading } = useRequest(async () => onConfirm(), {
    onSuccess: onClose
  });

  return (
    <Popover
      isOpen={isOpen}
      initialFocusRef={firstFieldRef}
      onOpen={onOpen}
      onClose={onClose}
      placement={placement}
      offset={offset}
      closeOnBlur={true}
      trigger={'click'}
      openDelay={100}
      closeDelay={100}
      isLazy
      lazyBehavior="unmount"
      arrowSize={10}
      strategy={'fixed'}
      computePositionOnMount={true}
    >
      <PopoverTrigger>{Trigger}</PopoverTrigger>
      <PopoverContent p={'20px'} w={'304px'} borderRadius={'10px'}>
        <PopoverArrow />

        <HStack alignItems={'flex-start'} color={'myGray.700'} spacing={'12px'}>
          {!type || type === 'info' ? (
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              bg={'primary.100'}
              borderRadius={'full'}
              w={'24px'}
              h={'24px'}
              flexShrink={0}
            >
              <MyIcon
                name={'common/confirm/infoTipClean'}
                w={'16px'}
                h={'16px'}
                color={'myGray.400'}
                fill={'myGray.400'}
                verticalAlign={'middle'}
              />
            </Flex>
          ) : (
            <Box flexShrink={0}>
              <MyIcon name={map.icon as any} w={'24px'} h={'24px'} verticalAlign={'middle'} />
            </Box>
          )}
          <Box fontSize={'sm'} whiteSpace={'pre-wrap'} flex={'1'} lineHeight={'20px'}>
            {content}
          </Box>
        </HStack>
        <HStack mt={'16px'} justifyContent={'flex-end'} spacing={'12px'}>
          {showCancel && (
            <Button
              variant={'whiteBase'}
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              {cancelText || t('common:Cancel')}
            </Button>
          )}
          <Button
            isLoading={loading}
            variant={map.variant}
            size="sm"
            onClick={async (e) => {
              e.stopPropagation();
              await onclickConfirm();
            }}
          >
            {confirmText || t('common:Confirm')}
          </Button>
        </HStack>
      </PopoverContent>
    </Popover>
  );
};

export default PopoverConfirm;
