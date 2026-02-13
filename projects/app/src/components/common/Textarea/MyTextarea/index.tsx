import React, { useCallback, useLayoutEffect, useRef } from 'react';

import {
  Box,
  Button,
  ModalBody,
  ModalFooter,
  Textarea,
  type TextareaProps,
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
              {t('common:Confirm')}
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
  const cursorPositionRef = useRef<number | null>(null);

  // 使用 useRef 保存 onChange,避免依赖变化导致 handleChange 重新创建
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 使用 useLayoutEffect 同步恢复光标位置,避免闪烁
  useLayoutEffect(() => {
    if (textareaRef.current && cursorPositionRef.current !== null) {
      const pos = cursorPositionRef.current;
      textareaRef.current.setSelectionRange(pos, pos);
      cursorPositionRef.current = null;
    }
  });

  // 移除 onChange 依赖,使 handleChange 引用永远稳定
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // 保存光标位置
    cursorPositionRef.current = e.target.selectionStart;
    onChangeRef.current?.(e);
  }, []);

  return (
    <Box h={'100%'} w={'100%'}>
      <Box position={'relative'}>
        <Textarea
          ref={textareaRef}
          maxW={'100%'}
          as={autoHeight ? ResizeTextarea : undefined}
          resize={showResize ? 'vertical' : 'none'}
          sx={
            !showResize
              ? {
                  '::-webkit-resizer': {
                    display: 'none !important'
                  }
                }
              : {}
          }
          {...props}
          maxH={`${maxH}px`}
          minH={`${minH}px`}
          onChange={handleChange}
        />
        {onOpenModal &&
          maxH &&
          textareaRef.current &&
          textareaRef.current.scrollHeight > Number(maxH) && (
            <Box
              zIndex={1}
              position={'absolute'}
              bottom={1}
              right={2}
              cursor={'pointer'}
              onClick={onOpenModal}
            >
              <MyTooltip label={t('common:ui.textarea.Magnifying')}>
                <MyIcon name={'common/fullScreenLight'} w={'14px'} color={'myGray.600'} />
              </MyTooltip>
            </Box>
          )}
      </Box>
    </Box>
  );
});
