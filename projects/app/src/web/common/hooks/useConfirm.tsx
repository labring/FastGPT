import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDisclosure, Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@/components/MyModal';

export const useConfirm = (props?: {
  title?: string;
  iconSrc?: string | '';
  content?: string;
  showCancel?: boolean;
  type?: 'common' | 'delete';
}) => {
  const { t } = useTranslation();

  const map = useMemo(() => {
    const map = {
      common: {
        title: t('common.confirm.Common Tip'),
        bg: undefined,
        iconSrc: 'common/confirm/commonTip'
      },
      delete: {
        title: t('common.Delete Warning'),
        bg: 'red.600',
        iconSrc: 'common/confirm/deleteTip'
      }
    };
    if (props?.type && map[props.type]) return map[props.type];
    return map.common;
  }, [props?.type, t]);

  const {
    title = map?.title || t('Warning'),
    iconSrc = map?.iconSrc,
    content,
    showCancel = true
  } = props || {};
  const [customContent, setCustomContent] = useState(content);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const confirmCb = useRef<any>();
  const cancelCb = useRef<any>();

  return {
    openConfirm: useCallback(
      (confirm?: any, cancel?: any, customContent?: string) => {
        confirmCb.current = confirm;
        cancelCb.current = cancel;

        customContent && setCustomContent(customContent);

        return onOpen;
      },
      [onOpen]
    ),
    ConfirmModal: useCallback(
      ({
        closeText = t('Cancel'),
        confirmText = t('Confirm'),
        isLoading,
        bg,
        countDown = 0
      }: {
        closeText?: string;
        confirmText?: string;
        isLoading?: boolean;
        bg?: string;
        countDown?: number;
      }) => {
        const timer = useRef<any>();
        const [countDownAmount, setCountDownAmount] = useState(countDown);

        useEffect(() => {
          timer.current = setInterval(() => {
            setCountDownAmount((val) => {
              if (val <= 0) {
                clearInterval(timer.current);
              }
              return val - 1;
            });
          }, 1000);
        }, []);

        return (
          <MyModal
            isOpen={isOpen}
            onClose={onClose}
            iconSrc={iconSrc}
            title={title}
            maxW={['90vw', '500px']}
          >
            <ModalBody pt={5}>{customContent}</ModalBody>
            <ModalFooter>
              {showCancel && (
                <Button
                  variant={'whiteBase'}
                  onClick={() => {
                    onClose();
                    typeof cancelCb.current === 'function' && cancelCb.current();
                  }}
                >
                  {closeText}
                </Button>
              )}

              <Button
                bg={bg ? bg : map.bg}
                isDisabled={countDownAmount > 0}
                ml={4}
                isLoading={isLoading}
                onClick={() => {
                  onClose();
                  typeof confirmCb.current === 'function' && confirmCb.current();
                }}
              >
                {countDownAmount > 0 ? `${countDownAmount}s` : confirmText}
              </Button>
            </ModalFooter>
          </MyModal>
        );
      },
      [customContent, iconSrc, isOpen, map.bg, onClose, showCancel, t, title]
    )
  };
};
