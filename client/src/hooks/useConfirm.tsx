import { useCallback, useRef } from 'react';
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

export const useConfirm = (props: { title?: string; content: string }) => {
  const { t } = useTranslation();
  const { title = t('Warning'), content } = props;

  const { isOpen, onOpen, onClose } = useDisclosure();
  const cancelRef = useRef(null);
  const confirmCb = useRef<any>();
  const cancelCb = useRef<any>();

  return {
    openConfirm: useCallback(
      (confirm?: any, cancel?: any) => {
        confirmCb.current = confirm;
        cancelCb.current = cancel;

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

              <AlertDialogBody>{content}</AlertDialogBody>

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
      [content, isOpen, onClose, title]
    )
  };
};
