import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  useDisclosure,
  Button,
  ModalBody,
  ModalFooter,
  Input,
  VStack,
  Box,
  type ImageProps
} from '@chakra-ui/react';
import { Trans, useTranslation } from 'next-i18next';
import MyModal from '../components/common/MyModal';
import { useMemoizedFn } from 'ahooks';
import { useMemoEnhance } from './useMemoEnhance';

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
  const [customContent, setCustomContent] = useState<string | React.ReactNode>(content);
  const [customContentInputConfirmText, setCustomContentInputConfirmText] = useState<
    string | undefined
  >(initialInputConfirmText);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const confirmCb = useRef<Function>();
  const cancelCb = useRef<any>();

  const openConfirm = useMemoizedFn(
    ({
      onConfirm,
      onCancel,
      customContent,
      inputConfirmText
    }: {
      onConfirm?: Function;
      onCancel?: any;
      customContent?: string | React.ReactNode;
      inputConfirmText?: string;
    }) => {
      confirmCb.current = onConfirm;
      cancelCb.current = onCancel;

      setCustomContent(customContent || content);
      setCustomContentInputConfirmText(inputConfirmText || initialInputConfirmText);

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
        : !!customContentInputConfirmText && inputValue.trim() === customContentInputConfirmText;

      return (
        <MyModal
          isOpen={isOpen}
          iconSrc={iconSrc}
          iconColor={iconColor}
          title={title}
          maxW={['90vw', '400px']}
        >
          <ModalBody pt={5} whiteSpace={'pre-wrap'} fontSize={'sm'}>
            {isInputDelete ? (
              <VStack align={'stretch'} spacing={3}>
                <Box whiteSpace={'pre-wrap'}>{customContent}</Box>
                <Box>
                  <Trans
                    i18nKey={'common:confirm_input_delete_tip'}
                    values={{ confirmText: customContentInputConfirmText }}
                    components={{
                      bold: <Box as={'span'} fontWeight={'bold'} userSelect={'all'} />
                    }}
                  />
                </Box>
                <Input
                  size={'sm'}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={t('common:confirm_input_delete_placeholder', {
                    confirmText: customContentInputConfirmText
                  })}
                />
              </VStack>
            ) : (
              customContent
            )}
          </ModalBody>
          {!hideFooter && (
            <ModalFooter>
              {showCancel && (
                <Button
                  size={'sm'}
                  variant={'whiteBase'}
                  onClick={() => {
                    onClose();
                    typeof cancelCb.current === 'function' && cancelCb.current();
                  }}
                  px={5}
                >
                  {closeText}
                </Button>
              )}

              <Button
                size={'sm'}
                variant={map.variant}
                isDisabled={countDownAmount > 0 || (isInputDelete && !isInputDeleteConfirmValid)}
                ml={3}
                isLoading={isLoading || requesting}
                px={5}
                onClick={async () => {
                  setRequesting(true);
                  try {
                    typeof confirmCb.current === 'function' && (await confirmCb.current());
                    onClose();
                  } catch (error) {}
                  setRequesting(false);
                }}
              >
                {countDownAmount > 0 ? `${countDownAmount}s` : confirmText}
              </Button>
            </ModalFooter>
          )}
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
