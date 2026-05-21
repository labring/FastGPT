import React, { useCallback, useEffect, useRef } from 'react';
import { Box, Button, Flex, Textarea, VStack } from '@chakra-ui/react';
import type { UseFieldArrayReturn, UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DeleteIcon from '@fastgpt/web/components/common/Icon/delete';
import MyBox from '@fastgpt/web/components/common/MyBox';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import {
  DatasetDataIndexTypeEnum,
  getDatasetIndexMapData
} from '@fastgpt/global/core/dataset/data/constants';
import { isDatasetDataSystemIndexType } from '@fastgpt/global/core/dataset/data/utils';
import type { InputDataType } from './useInputDataModal';

type IndexField = UseFieldArrayReturn<InputDataType, 'indexes'>['fields'][number];

const IndexInputPanel = ({
  canWrite,
  deletingIndexClientId,
  focusIndexClientId,
  indexes,
  isDeletingIndex,
  maxToken,
  register,
  watchedIndexes,
  onAddIndex,
  onDeleteIndex,
  onSaveIndex,
  onAutoFocusIndex,
  onIndexFocus,
  onIndexBlur,
  onDeleteIntent,
  updateIndexFold
}: {
  canWrite: boolean;
  deletingIndexClientId?: string;
  focusIndexClientId?: string;
  indexes: IndexField[];
  isDeletingIndex: boolean;
  maxToken: number;
  register: UseFormRegister<InputDataType>;
  watchedIndexes?: InputDataType['indexes'];
  onAddIndex: () => void;
  onDeleteIndex: (clientId: string) => void;
  onSaveIndex: (clientId: string) => void;
  onAutoFocusIndex: (clientId: string) => void;
  onIndexFocus: (clientId: string) => void;
  onIndexBlur: (clientId: string) => void;
  onDeleteIntent: (clientId: string) => void;
  updateIndexFold: (clientId: string, fold: boolean) => void;
}) => {
  const { t } = useTranslation();

  return (
    <Flex flexDir={'column'} flex={'1 0 0'} w={['100%', 0]} minH={0}>
      <Flex
        alignItems={'center'}
        justifyContent={'space-between'}
        h={'20px'}
        mb={'8px'}
        flexShrink={0}
      >
        <FormLabel color={'myGray.900'} fontSize={'14px'} lineHeight={'20px'}>
          {t('common:dataset.data.edit.Index', {
            amount: indexes.length
          })}
        </FormLabel>
        <Button
          variant={'whiteBase'}
          size={'sm'}
          h={'30px'}
          px={'14px'}
          py={'7px'}
          borderRadius={'6px'}
          isDisabled={!canWrite}
          onClick={onAddIndex}
        >
          <Flex alignItems={'center'} fontSize={'12px'} lineHeight={'16px'} color={'myGray.600'}>
            <MyIcon name={'common/addLight'} w={'1rem'} mr={'6px'} />
            {t('common:add_new')}
          </Flex>
        </Button>
      </Flex>

      <Box flex={'1 0 0'} h={0} minH={0} overflow={['unset', 'auto']}>
        <VStack spacing={'8px'} alignItems={'stretch'}>
          {indexes?.map((field, i) => {
            const index = watchedIndexes?.[i] || field;
            const data = getDatasetIndexMapData(index.type);
            const canFoldIndex = indexes.length > 1;
            const hasIndexDataId = !!index.dataId;
            const isDeletingCurrentIndex = deletingIndexClientId === index.clientId;
            const isSystem = isDatasetDataSystemIndexType(index.type);
            const canDeleteIndex =
              canWrite && !isSystem && hasIndexDataId && !isDeletingCurrentIndex;
            const canToggleFold = canFoldIndex && !isDeletingCurrentIndex;
            const isImageEmbeddingIndex = index.type === DatasetDataIndexTypeEnum.imageEmbedding;
            const indexText = isImageEmbeddingIndex
              ? t('dataset:image_embedding_index_default_desc')
              : index.text;

            return (
              <MyBox
                key={field.clientId}
                isLoading={isDeletingCurrentIndex}
                p={'16px'}
                borderRadius={'8px'}
                border={'1px solid'}
                borderColor={'borderColor.low'}
                bg={'myGray.25'}
                w={'100%'}
                minH={'104px'}
                // MyBox renders loading as an overlay; keep the textarea mounted to avoid height jumps.
                pointerEvents={isDeletingCurrentIndex ? 'none' : 'auto'}
                _hover={{
                  '& .delete': {
                    display: 'block'
                  }
                }}
              >
                <Flex mb={'8px'} alignItems={'center'} h={'24px'}>
                  <FormLabel
                    flex={'1 0 0'}
                    color={'myGray.900'}
                    fontSize={'14px'}
                    lineHeight={'20px'}
                  >
                    {t(data.label)}
                  </FormLabel>
                  {canDeleteIndex && (
                    <Flex className={'delete'} display={'none'} borderRight={'base'} pr={3} mr={2}>
                      <DeleteIcon
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onDeleteIntent(index.clientId);
                        }}
                        onClick={() => {
                          if (isDeletingIndex) return;
                          onDeleteIndex(index.clientId);
                        }}
                      />
                    </Flex>
                  )}
                  {canToggleFold && (
                    <MyIconButton
                      icon={index.fold ? 'core/chat/chevronDown' : 'core/chat/chevronUp'}
                      w={'24px'}
                      h={'24px'}
                      color={'myGray.500'}
                      hoverBg={'transparent'}
                      onClick={() => {
                        updateIndexFold(index.clientId, !index.fold);
                      }}
                    />
                  )}
                </Flex>
                <DataIndexTextArea
                  disabled={!canWrite || isSystem}
                  canClickMark={hasIndexDataId}
                  autoFocus={focusIndexClientId === index.clientId}
                  index={i}
                  value={indexText}
                  isFolder={index.fold && canFoldIndex}
                  maxToken={maxToken}
                  register={register}
                  onFocus={() => {
                    onIndexFocus(index.clientId);
                    updateIndexFold(index.clientId, false);
                  }}
                  onAutoFocus={() => {
                    onAutoFocusIndex(index.clientId);
                  }}
                  onBlur={() => {
                    onIndexBlur(index.clientId);
                    if (!canWrite) return;
                    onSaveIndex(index.clientId);
                  }}
                />
              </MyBox>
            );
          })}
        </VStack>
      </Box>
    </Flex>
  );
};

export default React.memo(IndexInputPanel);

const textareaMinH = '40px';

const DataIndexTextArea = ({
  value,
  index,
  maxToken,
  register,
  disabled,
  canClickMark,
  autoFocus,
  isFolder,
  onFocus,
  onAutoFocus,
  onBlur: onSaveBlur
}: {
  value: string;
  index: number;
  maxToken: number;
  register: UseFormRegister<InputDataType>;
  disabled?: boolean;
  canClickMark?: boolean;
  autoFocus?: boolean;
  isFolder: boolean;
  onFocus: () => void;
  onAutoFocus?: () => void;
  onBlur: () => void;
}) => {
  const { t } = useTranslation();
  const TextareaDom = useRef<HTMLTextAreaElement | null>(null);
  const {
    ref: TextareaRef,
    required,
    name,
    onChange: onTextChange,
    onBlur
  } = register(`indexes.${index}.text`, { required: true });

  useEffect(() => {
    if (TextareaDom.current) {
      TextareaDom.current.style.height = textareaMinH;
      TextareaDom.current.style.height = `${TextareaDom.current.scrollHeight + 5}px`;
    }
  }, []);

  useEffect(() => {
    if (!autoFocus || disabled || !TextareaDom.current) return;

    // New rows are prepended before the textarea ref is ready, so focus on the next tick.
    const timer = window.setTimeout(() => {
      TextareaDom.current?.focus();
      onFocus();
      onAutoFocus?.();
    });

    return () => {
      window.clearTimeout(timer);
    };
  }, [autoFocus, disabled, onAutoFocus, onFocus]);

  const autoHeight = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target) {
      e.target.style.height = textareaMinH;
      e.target.style.height = `${e.target.scrollHeight + 5}px`;
    }
  }, []);

  const handleClickFoldMask = () => {
    TextareaDom?.current?.focus();
    onFocus();
  };

  return (
    <Box
      pos={'relative'}
      {...(isFolder
        ? {
            maxH: '40px',
            overflow: 'hidden'
          }
        : {
            maxH: 'auto'
          })}
    >
      {disabled ? (
        <Box fontSize={'sm'} color={'myGray.600'} letterSpacing={'0.004em'} whiteSpace={'pre-wrap'}>
          {value}
        </Box>
      ) : (
        <Textarea
          maxLength={maxToken}
          borderColor={'transparent'}
          minH={'32px'}
          px={0}
          pt={0}
          isRequired={required}
          whiteSpace={'pre-wrap'}
          resize={'none'}
          fontSize={'sm'}
          color={'myGray.500'}
          letterSpacing={'0.004em'}
          _focus={{
            px: 3,
            py: 1,
            borderColor: 'primary.500',
            boxShadow: 'focus',
            bg: 'white'
          }}
          sx={{
            '&::-webkit-scrollbar-thumb': {
              background: 'var(--chakra-colors-myGray-150) !important',
              transition: 'background 1s',
              marginLeft: '5px'
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: 'var(--chakra-colors-myGray-250) !important'
            }
          }}
          placeholder={t('common:dataset.data.Index Placeholder')}
          ref={(e) => {
            if (e) TextareaDom.current = e;
            TextareaRef(e);
          }}
          required
          name={name}
          onChange={(e) => {
            autoHeight(e);
            onTextChange(e);
          }}
          onFocus={autoHeight}
          onBlur={(e) => {
            onBlur(e);
            onSaveBlur();
          }}
        />
      )}
      {isFolder && (
        <Box
          pos={'absolute'}
          bottom={0}
          left={0}
          right={0}
          top={0}
          bg={
            'linear-gradient(182deg, rgba(251, 251, 252, 0.00) 1.76%, var(--chakra-colors-myGray-25) 84.07%)'
          }
          borderRadius={'6px'}
          {...(disabled || !canClickMark
            ? {}
            : {
                // Unsaved rows can still be edited directly, but folded overlay click needs a backend id.
                cursor: 'pointer',
                onClick: handleClickFoldMask
              })}
        />
      )}
    </Box>
  );
};
