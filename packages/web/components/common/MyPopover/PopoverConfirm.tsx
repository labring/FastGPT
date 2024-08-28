import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '../Icon';
import { useRequest2 } from '../../../hooks/useRequest';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  useDisclosure,
  PlacementWithLogical,
  HStack,
  Box,
  Button,
  PopoverArrow
} from '@chakra-ui/react';

const PopoverConfirm = ({
  content,
  showCancel,
  type,
  Trigger,
  placement = 'bottom-start',
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
  onConfirm: () => any;
  confirmText?: string;
  cancelText?: string;
}) => {
  const { t } = useTranslation();

  const map = useMemo(() => {
    const map = {
      info: {
        variant: 'primary',
        icon: 'common/confirm/commonTip'
      },
      delete: {
        variant: 'dangerFill',
        icon: 'common/confirm/deleteTip'
      }
    };
    if (type && map[type]) return map[type];
    return map.info;
  }, [type, t]);

  const firstFieldRef = React.useRef(null);
  const { onOpen, onClose, isOpen } = useDisclosure();

  const { runAsync: onclickConfirm, loading } = useRequest2(onConfirm, {
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
      closeOnBlur={false}
      trigger={'click'}
      openDelay={100}
      closeDelay={100}
      isLazy
      lazyBehavior="keepMounted"
      arrowSize={10}
    >
      <PopoverTrigger>{Trigger}</PopoverTrigger>
      <PopoverContent p={4}>
        <PopoverArrow />

        <HStack alignItems={'flex-start'} color={'myGray.700'}>
          <MyIcon name={map.icon as any} w={'1.5rem'} />
          <Box fontSize={'sm'}>{content}</Box>
        </HStack>
        <HStack mt={1} justifyContent={'flex-end'}>
          {showCancel && (
            <Button variant={'whiteBase'} size="sm" onClick={onClose}>
              {cancelText || t('common:common.Cancel')}
            </Button>
          )}
          <Button isLoading={loading} variant={map.variant} size="sm" onClick={onclickConfirm}>
            {confirmText || t('common:common.Confirm')}
          </Button>
        </HStack>
      </PopoverContent>
    </Popover>
  );
};

export default PopoverConfirm;
