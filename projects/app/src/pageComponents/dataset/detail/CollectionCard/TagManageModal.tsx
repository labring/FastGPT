import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, Input } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import {
  delDatasetCollectionTag,
  postCreateDatasetCollectionTag,
  updateDatasetCollectionTag
} from '@/web/core/dataset/api/collection';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  DatasetCollectionTagTypeEnum,
  DatasetCollectionTagTypeMap,
  type DatasetTagType
} from '@fastgpt/global/core/dataset/type';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { SaveActionIcon, TagActionButton, TagTableContainer, TagTableHeader } from './TagCommon';

const TAG_TABLE_COLUMNS = 'minmax(0, 1fr) 180px 100px';

const TagOptionManagePopover = ({
  options,
  isSaving,
  onSave
}: {
  options: string[];
  isSaving: boolean;
  onSave: (options: string[]) => Promise<void>;
}) => {
  const { t } = useTranslation();
  const [draftOptions, setDraftOptions] = useState(options);
  const savedOptionsRef = useRef(options);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const persistOptions = async (nextOptions: string[]) => {
    const normalizedOptions = [
      ...new Set(nextOptions.map((option) => option.trim()).filter(Boolean))
    ];
    setDraftOptions(nextOptions);

    try {
      await onSave(normalizedOptions);
      savedOptionsRef.current = normalizedOptions;
    } catch {
      setDraftOptions(savedOptionsRef.current);
    }
  };

  const handleAddOption = () => {
    setDraftOptions((prev) => {
      const next = [...prev, ''];
      setTimeout(() => {
        inputRefs.current[next.length - 1]?.focus();
      }, 50);
      return next;
    });
  };

  const handleUpdateOption = (index: number, value: string) => {
    setDraftOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleRemoveOption = (index: number) => {
    void persistOptions(draftOptions.filter((_, i) => i !== index));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (draftOptions[index]?.trim() && !isSaving) {
        void persistOptions(draftOptions);
      }
      if (index === draftOptions.length - 1) {
        handleAddOption();
      } else {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  return (
    <MyPopover
      placement={'bottom-start'}
      trigger={'click'}
      hasArrow={false}
      offset={[0, 4]}
      closeOnBlur={true}
      w={'152px'}
      p={1.5}
      borderRadius={'sm'}
      boxShadow={'md'}
      bg={'white'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      Trigger={
        <Flex
          as={'button'}
          type={'button'}
          aria-label={t('dataset:tag.manage_options')}
          alignItems={'center'}
          justifyContent={'center'}
          p={1}
          borderRadius={'sm'}
          color={'myGray.600'}
          cursor={'pointer'}
          _hover={{
            bg: 'myGray.05',
            color: 'primary.700'
          }}
        >
          <MyIcon name={'common/setting'} w={'16px'} h={'16px'} />
        </Flex>
      }
    >
      {() => (
        <Flex direction={'column'} w={'full'}>
          <Flex
            alignItems={'center'}
            gap={2}
            h={'28px'}
            px={1}
            py={1.5}
            borderRadius={'xs'}
            cursor={'pointer'}
            _hover={{ bg: 'myGray.100' }}
            onClick={handleAddOption}
          >
            <MyIcon name={'common/addLight'} w={'16px'} h={'16px'} color={'primary.700'} />
            <Box fontSize={'xs'} fontWeight={'medium'} lineHeight={'16px'} color={'primary.700'}>
              {t('dataset:tag.add_option')}
            </Box>
          </Flex>

          {draftOptions.length > 0 && (
            <Flex maxH={'134px'} overflowY={'auto'} direction={'column'} gap={'2px'} mt={0.5}>
              {draftOptions.map((opt, index) => (
                <Flex key={index} gap={1} alignItems={'center'} w={'full'}>
                  <Input
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    value={opt}
                    flex={1}
                    minW={0}
                    h={'32px'}
                    px={3}
                    fontSize={'xs'}
                    lineHeight={'16px'}
                    borderRadius={'sm'}
                    border={'1px solid'}
                    borderColor={'myGray.200'}
                    placeholder={t('dataset:tag.enter_option')}
                    isDisabled={isSaving}
                    _focus={{
                      borderColor: 'primary.600',
                      boxShadow: 'focus'
                    }}
                    onChange={(e) => handleUpdateOption(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                  />
                  <Flex
                    as={'button'}
                    type={'button'}
                    p={1}
                    flexShrink={0}
                    alignItems={'center'}
                    justifyContent={'center'}
                    borderRadius={'sm'}
                    cursor={isSaving ? 'not-allowed' : 'pointer'}
                    aria-disabled={isSaving}
                    _hover={isSaving ? undefined : { bg: 'myGray.05' }}
                    onClick={() => !isSaving && handleRemoveOption(index)}
                  >
                    <MyIcon name={'close'} w={'16px'} h={'16px'} color={'myGray.500'} />
                  </Flex>
                </Flex>
              ))}
            </Flex>
          )}
        </Flex>
      )}
    </MyPopover>
  );
};

const TagManageModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { datasetDetail, allDatasetTags, loadAllDatasetTags } = useContextSelector(
    DatasetPageContext,
    (v) => v
  );

  const tagInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [newTag, setNewTag] = useState<string | undefined>(undefined);
  const [newTagType, setNewTagType] = useState<DatasetCollectionTagTypeEnum | undefined>(undefined);
  const [currentEditTagContent, setCurrentEditTagContent] = useState<string | undefined>(undefined);
  const [currentEditTag, setCurrentEditTag] = useState<DatasetTagType | undefined>(undefined);

  useEffect(() => {
    if (newTag !== undefined) {
      tagInputRef.current?.focus();
    }
  }, [newTag]);

  useEffect(() => {
    if (currentEditTag !== undefined) {
      editInputRef.current?.focus();
    }
  }, [currentEditTag]);

  const { openConfirm: openDeleteConfirm, ConfirmModal: DeleteConfirmModal } = useConfirm({
    type: 'delete',
    title: t('dataset:tag.delete_tag_confirm_title'),
    content: t('dataset:tag.delete_tag_confirm_content')
  });

  const { runAsync: onDeleteCollectionTag } = useRequest(
    (tagId: string) =>
      delDatasetCollectionTag({
        datasetId: datasetDetail._id,
        id: tagId
      }),
    {
      onSuccess() {
        loadAllDatasetTags();
      },
      successToast: t('dataset:tag.delete_success'),
      errorToast: t('dataset:tag.delete_failed')
    }
  );

  const { runAsync: onCreateCollectionTag } = useRequest(
    ({ tag, tagType }: { tag: string; tagType: DatasetCollectionTagTypeEnum }) =>
      postCreateDatasetCollectionTag({
        datasetId: datasetDetail._id,
        tag,
        tagType
      }),
    {
      onSuccess() {
        loadAllDatasetTags();
      },
      successToast: t('dataset:tag.create_success'),
      errorToast: t('dataset:tag.create_failed')
    }
  );

  const { runAsync: onUpdateCollectionTag } = useRequest(
    (tag: DatasetTagType) =>
      updateDatasetCollectionTag({
        datasetId: datasetDetail._id,
        tagId: tag._id,
        tag: tag.tag
      }),
    {
      onSuccess() {
        loadAllDatasetTags();
      },
      successToast: t('dataset:tag.save_success'),
      errorToast: t('dataset:tag.save_failed')
    }
  );

  const { runAsync: onSaveTagOptions, loading: isSavingTagOptions } = useRequest(
    ({ tag, options }: { tag: DatasetTagType; options: string[] }) =>
      updateDatasetCollectionTag({
        datasetId: datasetDetail._id,
        tagId: tag._id,
        tag: tag.tag,
        options
      }),
    {
      onSuccess: loadAllDatasetTags,
      errorToast: t('dataset:tag.save_failed')
    }
  );

  const tagTypeOptions = [
    DatasetCollectionTagTypeEnum.array,
    DatasetCollectionTagTypeEnum.number,
    DatasetCollectionTagTypeEnum.datetime
  ].map((tagType) => ({
    label: t(DatasetCollectionTagTypeMap[tagType].label),
    value: tagType
  }));

  const submitNewTag = async () => {
    const tag = newTag?.trim();
    if (!tag || !newTagType || allDatasetTags.some((item) => item.tag === tag)) return;

    await onCreateCollectionTag({ tag, tagType: newTagType });
    setNewTag(undefined);
    setNewTagType(undefined);
  };

  const submitUpdatedTag = async (tag: DatasetTagType) => {
    const content = currentEditTagContent?.trim();
    if (
      content &&
      content !== tag.tag &&
      !allDatasetTags.some((item) => item._id !== tag._id && item.tag === content)
    ) {
      await onUpdateCollectionTag({ ...tag, tag: content });
    }
    setCurrentEditTag(undefined);
    setCurrentEditTagContent(undefined);
  };

  const cancelNewTag = () => {
    setNewTag(undefined);
    setNewTagType(undefined);
  };

  const canSaveNewTag = Boolean(
    newTag?.trim() && newTagType && !allDatasetTags.some((item) => item.tag === newTag.trim())
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      size={'xl'}
      w={'800px'}
      minH={'400px'}
      maxH={'80vh'}
      isCentered
      title={
        <Flex alignItems={'center'} gap={1}>
          <Box>{t('dataset:tag.manage')}</Box>
          <QuestionTip
            label={t('dataset:core.dataset.tags.tagType')}
            w={'20px'}
            h={'20px'}
            color={'myGray.600'}
          />
        </Flex>
      }
      closeOnOverlayClick={false}
      bodyStyles={{
        flex: 1,
        minH: 0,
        pb: 0,
        overflow: 'hidden'
      }}
      footerStyles={{
        justifyContent: 'flex-start',
        px: 8,
        pt: 2,
        pb: 8
      }}
      footer={
        <Button
          h={'36px'}
          px={'14px'}
          variant={'primaryOutline'}
          color={'primary.700'}
          leftIcon={<MyIcon name={'common/addLight'} w={'18px'} h={'18px'} />}
          onClick={() => {
            setCurrentEditTag(undefined);
            setCurrentEditTagContent(undefined);
            setNewTag('');
            setNewTagType(undefined);
          }}
        >
          {t('dataset:tag.add_tag')}
        </Button>
      }
      borderRadius={'10px'}
      sx={{
        '.chakra-modal__close-btn': {
          top: 2,
          right: 2,
          w: '36px',
          h: '36px'
        }
      }}
    >
      <TagTableContainer>
        <TagTableHeader columns={TAG_TABLE_COLUMNS}>
          <Box px={6}>{t('dataset:tag.name')}</Box>
          <Box px={6}>{t('dataset:tag.attribute')}</Box>
          <Box px={6}>{t('common:Operation')}</Box>
        </TagTableHeader>

        <Box
          flex={'1 1 auto'}
          minH={0}
          overflowY={'auto'}
          display={'flex'}
          flexDirection={'column'}
          fontSize={'sm'}
          lineHeight={'20px'}
          color={'myGray.600'}
        >
          {allDatasetTags.length === 0 ? (
            <EmptyTip text={t('dataset:dataset.no_tags')} />
          ) : (
            allDatasetTags.map((tag) => {
              const isEditing = currentEditTag?._id === tag._id;
              const tagType = tag.tagType ?? DatasetCollectionTagTypeEnum.string;
              const editedTagContent = currentEditTagContent?.trim();
              const canSaveEditedTag = Boolean(
                editedTagContent &&
                editedTagContent !== tag.tag &&
                !allDatasetTags.some(
                  (item) => item._id !== tag._id && item.tag === editedTagContent
                )
              );

              return (
                <Box
                  key={tag._id}
                  display={'grid'}
                  gridTemplateColumns={TAG_TABLE_COLUMNS}
                  alignItems={'center'}
                  h={'80px'}
                  flexShrink={0}
                  borderBottom={'1px solid'}
                  borderColor={'myGray.150'}
                >
                  <Box px={6} minW={0}>
                    {isEditing ? (
                      <Input
                        ref={editInputRef}
                        value={currentEditTagContent ?? tag.tag}
                        placeholder={t('dataset:tag.Edit_tag')}
                        maxLength={20}
                        size={'sm'}
                        onChange={(e) => setCurrentEditTagContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (canSaveEditedTag) {
                              void submitUpdatedTag(tag);
                            }
                          }
                        }}
                      />
                    ) : (
                      <Box overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
                        {tag.tag}
                      </Box>
                    )}
                  </Box>
                  <Flex px={6} alignItems={'center'} gap={1}>
                    <Box>{t(DatasetCollectionTagTypeMap[tagType].label)}</Box>
                    {tagType === DatasetCollectionTagTypeEnum.array && (
                      <TagOptionManagePopover
                        key={`${tag._id}-${JSON.stringify(tag.options ?? [])}`}
                        options={tag.options ?? []}
                        isSaving={isSavingTagOptions}
                        onSave={(options) => onSaveTagOptions({ tag, options })}
                      />
                    )}
                  </Flex>
                  <Flex px={6} gap={1} alignItems={'center'}>
                    {isEditing ? (
                      <>
                        <TagActionButton
                          label={t('common:Save')}
                          icon={<SaveActionIcon isEnabled={canSaveEditedTag} />}
                          isDisabled={!canSaveEditedTag}
                          hoverIconClassName={canSaveEditedTag ? 'tag-save-icon-hover' : undefined}
                          onClick={() => void submitUpdatedTag(tag)}
                        />
                        <TagActionButton
                          label={t('common:Close')}
                          icon={<MyIcon name={'close'} w={'16px'} h={'16px'} />}
                          hoverColor={'myGray.700'}
                          onClick={() => {
                            setCurrentEditTag(undefined);
                            setCurrentEditTagContent(undefined);
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <TagActionButton
                          label={t('common:Edit')}
                          icon={<MyIcon name={'edit'} w={'16px'} h={'16px'} />}
                          hoverColor={'primary.700'}
                          onClick={() => {
                            setCurrentEditTag(tag);
                            setCurrentEditTagContent(tag.tag);
                          }}
                        />
                        <TagActionButton
                          label={t('common:Delete')}
                          icon={<MyIcon name={'delete'} w={'16px'} h={'16px'} />}
                          hoverColor={'red.600'}
                          onClick={() => {
                            openDeleteConfirm({
                              onConfirm: () => onDeleteCollectionTag(tag._id)
                            })();
                          }}
                        />
                      </>
                    )}
                  </Flex>
                </Box>
              );
            })
          )}

          {newTag !== undefined && (
            <Box
              display={'grid'}
              gridTemplateColumns={TAG_TABLE_COLUMNS}
              alignItems={'center'}
              h={'80px'}
              flexShrink={0}
              borderBottom={'1px solid'}
              borderColor={'myGray.150'}
            >
              <Box px={6}>
                <Input
                  ref={tagInputRef}
                  value={newTag}
                  placeholder={t('dataset:tag.enter_name')}
                  maxLength={20}
                  size={'sm'}
                  onChange={(e) => setNewTag(e.target.value)}
                />
              </Box>
              <Box px={6}>
                <MySelect<DatasetCollectionTagTypeEnum>
                  value={newTagType}
                  placeholder={t('dataset:tag.select_attribute')}
                  list={tagTypeOptions}
                  width={'100%'}
                  h={'36px'}
                  fontSize={'sm'}
                  lineHeight={'20px'}
                  letterSpacing={'0.25px'}
                  onChange={(val) => setNewTagType(val)}
                  menuPlacement={'bottom-start'}
                />
              </Box>
              <Flex px={6} gap={1} alignItems={'center'}>
                <TagActionButton
                  label={t('common:Save')}
                  icon={<SaveActionIcon isEnabled={canSaveNewTag} />}
                  isDisabled={!canSaveNewTag}
                  hoverIconClassName={canSaveNewTag ? 'tag-save-icon-hover' : undefined}
                  onClick={() => void submitNewTag()}
                />
                <TagActionButton
                  label={t('common:Close')}
                  icon={<MyIcon name={'close'} w={'16px'} h={'16px'} />}
                  hoverColor={'myGray.700'}
                  onClick={cancelNewTag}
                />
              </Flex>
            </Box>
          )}
        </Box>
      </TagTableContainer>
      <DeleteConfirmModal />
    </MyModal>
  );
};

export default React.memo(TagManageModal);
