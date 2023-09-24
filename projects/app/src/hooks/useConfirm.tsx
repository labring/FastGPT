import { useCallback, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  useDisclosure,
  Button
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

export const useConfirm = (props: { title?: string | null; content?: string | null }) => {
  const { t } = useTranslation();
  const { title = t('Warning'), content } = props;
  const [customContent, setCustomContent] = useState(content);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const cancelRef = useRef(null);
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
      () => (
        <AlertDialog
          isOpen={isOpen}
          leastDestructiveRef={cancelRef}
          autoFocus={false}
          onClose={onClose}
        >
          <AlertDialogOverlay>
            <AlertDialogContent maxW={'min(90vw,400px)'}>
              <AlertDialogHeader fontSize="lg" fontWeight="bold">
                {title}
              </AlertDialogHeader>

              <AlertDialogBody>{customContent}</AlertDialogBody>

              <AlertDialogFooter>
                <Button
                  variant={'base'}
                  onClick={() => {
                    onClose();
                    typeof cancelCb.current === 'function' && cancelCb.current();
                  }}
                >
                  {t('Cancel')}
                </Button>
                <Button
                  ml={4}
                  onClick={() => {
                    onClose();
                    typeof confirmCb.current === 'function' && confirmCb.current();
                  }}
                >
                  {t('Confirm')}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogOverlay>
        </AlertDialog>
      ),
      [customContent, isOpen, onClose, t, title]
    )
  };
};
