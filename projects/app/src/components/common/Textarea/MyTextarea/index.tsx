import React, { useRef, useState } from 'react';

import {
  Box,
  Button,
  ModalBody,
  ModalFooter,
  Textarea,
  TextareaProps,
  useDisclosure
} from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import ResizeTextarea from 'react-textarea-autosize';

type Props = TextareaProps & {
  title?: string;
  iconSrc?: string;
  autoHeight?: boolean;
};

const MyTextarea = React.forwardRef<HTMLTextAreaElement, Props>(function MyTextarea(props, ref) {
  const ModalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const TextareaRef = useRef<HTMLTextAreaElement>(null);
  React.useImperativeHandle(ref, () => TextareaRef.current!);

  const { t } = useTranslation();
  const {
    title = t('common:core.app.edit.Prompt Editor'),
    iconSrc = 'modal/edit',
    autoHeight = false,
    onChange,
    maxH,
    minH,
    ...childProps
  } = props;

  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <Editor
        textareaRef={TextareaRef}
        autoHeight={autoHeight}
        onChange={onChange}
        maxH={maxH}
        minH={minH}
        showResize={!autoHeight}
        {...childProps}
        onOpenModal={onOpen}
      />
      {isOpen && (
        <MyModal iconSrc={iconSrc} title={title} isOpen onClose={onClose}>
          <ModalBody>
            <Editor
              textareaRef={ModalTextareaRef}
              onChange={onChange}
              {...childProps}
              maxH={500}
              minH={500}
              minW={['100%', '512px']}
              showResize={false}
            />
          </ModalBody>
          <ModalFooter>
            <Button
              onClick={() => {
                if (ModalTextareaRef.current && TextareaRef.current) {
                  TextareaRef.current.value = ModalTextareaRef.current.value;
                }

                onClose();
              }}
            >
              {t('common:common.Confirm')}
            </Button>
          </ModalFooter>
        </MyModal>
      )}
    </>
  );
});

export default React.memo(MyTextarea);

const Editor = React.memo(function Editor({
  onOpenModal,
  textareaRef,
  autoHeight = false,
  onChange,
  maxH,
  minH,
  showResize,
  ...props
}: Props & {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onOpenModal?: () => void;
  showResize?: boolean;
}) {
  const { t } = useTranslation();
  const [scrollHeight, setScrollHeight] = useState(0);

  return (
    <Box h={'100%'} w={'100%'} position={'relative'}>
      <Textarea
        ref={textareaRef}
        maxW={'100%'}
        as={autoHeight ? ResizeTextarea : undefined}
        sx={
          !showResize
            ? {
                '::-webkit-resizer': {
                  display: 'none'
                }
              }
            : {}
        }
        {...props}
        maxH={`${maxH}px`}
        minH={`${minH}px`}
        onChange={(e) => {
          setScrollHeight(e.target.scrollHeight);
          onChange?.(e);
        }}
      />
      {onOpenModal && maxH && scrollHeight > Number(maxH) && (
        <Box
          zIndex={1}
          position={'absolute'}
          bottom={1}
          right={2}
          cursor={'pointer'}
          onClick={onOpenModal}
        >
          <MyTooltip label={t('common:common.ui.textarea.Magnifying')}>
            <MyIcon name={'common/fullScreenLight'} w={'14px'} color={'myGray.600'} />
          </MyTooltip>
        </Box>
      )}
    </Box>
  );
});
