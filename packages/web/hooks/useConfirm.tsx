import React, { useEffect, useRef, useState } from 'react';
import {
  useDisclosure,
  Button,
  VStack,
  Box,
  Flex,
  HStack,
  type ImageProps
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '../components/v2/common/MyModal';
import MyIcon from '../components/common/Icon';
import Avatar from '../components/common/Avatar';
import { useMemoizedFn } from 'ahooks';
import { useMemoEnhance } from './useMemoEnhance';
import DeleteConfirmInput from '../components/common/DeleteConfirmInput';

type ConfirmCallback = () => Promise<unknown> | unknown;
type CancelCallback = () => void;

export const useConfirm = (props?: {
  title?: string;
  iconSrc?: string | '';
  content?: string;
  showCancel?: boolean;
  type?: 'common' | 'delete';
  hideFooter?: boolean;
  iconColor?: ImageProps['color'];
  inputConfirmText?: string;
}) => {
  const { t } = useTranslation();

  const map = useMemoEnhance(() => {
    const map = {
      common: {
        title: t('common:action_confirm'),
        variant: 'primary',
        iconSrc: 'common/confirm/commonTip'
      },
      delete: {
        title: t('common:delete_warning'),
        variant: 'dangerFill',
        iconSrc: 'common/confirm/deleteTip'
      }
    };
    if (props?.type && map[props.type]) return map[props.type];
    return map.common;
  }, [props?.type, t]);

  const {
    title = map?.title || t('common:Warning'),
    iconSrc = map?.iconSrc,
    iconColor,
    content,
    showCancel = true,
    hideFooter = false,
    inputConfirmText: initialInputConfirmText
  } = props || {};

  const [customTitle, setCustomTitle] = useState<React.ReactNode>();
  const [customContent, setCustomContent] = useState<string | React.ReactNode>(content);
  const [customContentInputConfirmText, setCustomContentInputConfirmText] = useState<
    string | undefined
  >(initialInputConfirmText);
  const [customConfirmText, setCustomConfirmText] = useState<React.ReactNode>();
  const [customCancelText, setCustomCancelText] = useState<React.ReactNode>();
  const [customShowCancel, setCustomShowCancel] = useState<boolean>();
  const [customConfirmButtonVariant, setCustomConfirmButtonVariant] = useState<string>();

  const { isOpen, onOpen, onClose } = useDisclosure();

  const confirmCb = useRef<ConfirmCallback>();
  const cancelCb = useRef<CancelCallback>();

  const openConfirm = useMemoizedFn(
    ({
      onConfirm,
      onCancel,
      customContent,
      inputConfirmText,
      title,
      confirmText,
      cancelText,
      showCancel,
      confirmButtonVariant
    }: {
      onConfirm?: ConfirmCallback;
      onCancel?: CancelCallback;
      customContent?: string | React.ReactNode;
      inputConfirmText?: string;
      title?: React.ReactNode;
      confirmText?: React.ReactNode;
      cancelText?: React.ReactNode;
      showCancel?: boolean;
      confirmButtonVariant?: string;
    }) => {
      confirmCb.current = onConfirm;
      cancelCb.current = onCancel;

      setCustomTitle(title);
      setCustomContent(customContent || content);
      setCustomContentInputConfirmText(inputConfirmText || initialInputConfirmText);
      setCustomConfirmText(confirmText);
      setCustomCancelText(cancelText);
      setCustomShowCancel(showCancel);
      setCustomConfirmButtonVariant(confirmButtonVariant);

      return onOpen;
    }
  );

  const ConfirmModal = useMemoizedFn(
    ({
      closeText = t('common:Cancel'),
      confirmText = t('common:Confirm'),
      isLoading,
      countDown = 0
    }: {
      closeText?: string;
      confirmText?: string;
      isLoading?: boolean;
      countDown?: number;
    }) => {
      const isInputDelete = !!customContentInputConfirmText;

      const timer = useRef<any>();
      const [countDownAmount, setCountDownAmount] = useState(countDown);
      const [requesting, setRequesting] = useState(false);
      const [inputValue, setInputValue] = useState('');

      useEffect(() => {
        if (isOpen) {
          setCountDownAmount(countDown);
          setInputValue('');
          timer.current = setInterval(() => {
            setCountDownAmount((val) => {
              if (val <= 0) {
                clearInterval(timer.current);
              }
              return val - 1;
            });
          }, 1000);

          return () => {
            clearInterval(timer.current);
          };
        }
      }, [isOpen]);

      const isInputDeleteConfirmValid = !isInputDelete
        ? true
        : !!customContentInputConfirmText &&
          inputValue.trim() === customContentInputConfirmText.trim();

      const handleClose = () => {
        onClose();
        if (typeof cancelCb.current === 'function') {
          cancelCb.current();
        }
      };

      const isDefaultIcon = !props?.iconSrc || props.iconSrc === map?.iconSrc;

      const finalTitle = customTitle || title;
      const finalConfirmText = customConfirmText || confirmText;
      const finalCancelText = customCancelText || closeText;
      const finalShowCancel = customShowCancel !== undefined ? customShowCancel : showCancel;
      const finalVariant = customConfirmButtonVariant || map.variant;

      return (
        <MyModal isOpen={isOpen} onClose={handleClose} isCentered size={'sm'} borderRadius={'10px'}>
          <Flex direction={'column'} gap={'24px'}>
            <HStack spacing={'12px'} align={'center'}>
              <Flex
                bg={'yellow.100'}
                borderRadius={'full'}
                p={'4px'}
                align={'center'}
                justify={'center'}
                flexShrink={0}
              >
                {isDefaultIcon ? (
                  <MyIcon
                    name={'common/exclamationMark'}
                    w={'16px'}
                    h={'16px'}
                    color={'yellow.700'}
                  />
                ) : (
                  <Avatar
                    color={iconColor}
                    objectFit={'contain'}
                    alt=""
                    src={iconSrc}
                    w={'16px'}
                    h={'16px'}
                  />
                )}
              </Flex>
              <Box
                flex={'1 0 0'}
                minW={0}
                fontSize={'20px'}
                fontWeight={'500'}
                lineHeight={'26px'}
                color={'myGray.900'}
              >
                {finalTitle}
              </Box>
            </HStack>

            <Flex direction={'column'} gap={'16px'}>
              <Box
                fontSize={'14px'}
                lineHeight={'20px'}
                color={'myGray.900'}
                whiteSpace={'pre-wrap'}
              >
                {customContent}
              </Box>
              {isInputDelete && (
                <DeleteConfirmInput
                  value={inputValue}
                  confirmText={customContentInputConfirmText}
                  placeholder={customContentInputConfirmText}
                  onChange={setInputValue}
                />
              )}
            </Flex>

            {!hideFooter && (
              <HStack spacing={'12px'} justify={'flex-end'}>
                {finalShowCancel && (
                  <Button
                    size={'sm'}
                    variant={'whiteBase'}
                    onClick={handleClose}
                    isDisabled={isLoading || requesting}
                    px={'14px'}
                  >
                    {finalCancelText}
                  </Button>
                )}
                <Button
                  size={'sm'}
                  variant={finalVariant}
                  isDisabled={countDownAmount > 0 || (isInputDelete && !isInputDeleteConfirmValid)}
                  isLoading={isLoading || requesting}
                  px={'14px'}
                  onClick={async () => {
                    setRequesting(true);
                    try {
                      if (typeof confirmCb.current === 'function') {
                        await confirmCb.current();
                      }
                      onClose();
                    } catch {}
                    setRequesting(false);
                  }}
                >
                  {countDownAmount > 0 ? `${countDownAmount}s` : finalConfirmText}
                </Button>
              </HStack>
            )}
          </Flex>
        </MyModal>
      );
    }
  );

  return {
    openConfirm,
    onClose,
    ConfirmModal
  };
};
