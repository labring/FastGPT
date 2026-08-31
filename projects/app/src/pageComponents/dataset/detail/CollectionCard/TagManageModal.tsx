import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, Input } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
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
  type DatasetCollectionTagType,
  DatasetCollectionTagTypeEnum,
  type DatasetTagType
} from '@fastgpt/global/core/dataset/type';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyPopover from '@fastgpt/web/components/common/MyPopover';

const TAG_TABLE_COLUMNS = 'minmax(0, 1fr) 180px 100px';
const TAG_TYPE_LABEL_KEYS: Record<DatasetTagType['tagType'], string> = {
  string: 'dataset:core.dataset.tags.string',
  number: 'dataset:core.dataset.tags.number',
  datetime: 'dataset:core.dataset.tags.date',
  array: 'dataset:core.dataset.tags.array'
};
const TAG_TYPE_SELECT_LABEL_KEYS: Record<Exclude<DatasetCollectionTagType, 'string'>, string> = {
  array: 'dataset:core.dataset.tags.array',
  number: 'dataset:core.dataset.tags.number',
  datetime: 'dataset:core.dataset.tags.time'
};

const TAG_TOOLTIP_PROPS = {
  placement: 'bottom' as const,
  offset: [0, 10] as [number, number],
  hasArrow: true,
  arrowSize: 10,
  px: '12px',
  py: '8px',
  borderRadius: '6px',
  fontSize: '12px',
  lineHeight: '18px',
  color: '#24282C',
  arrowShadowColor: 'rgba(19, 51, 107, 0.1)',
  boxShadow: '0px 4px 5px rgba(19, 51, 107, 0.1), 0px 0px 0.5px rgba(19, 51, 107, 0.1)'
};

/** 保存图标使用设计稿提供的灰色、可保存蓝色和 hover 深蓝色资源。 */
const SaveActionIcon = ({ isEnabled }: { isEnabled: boolean }) => {
  if (!isEnabled) {
    return <MyIcon name={'common/checkSquareBroken'} w={'16px'} h={'16px'} />;
  }

  return (
    <Box position={'relative'} w={'16px'} h={'16px'}>
      <MyIcon
        name={'common/checkSquareBrokenPrimary'}
        w={'16px'}
        h={'16px'}
        position={'absolute'}
        inset={0}
      />
      <MyIcon
        name={'common/checkSquareBrokenPrimaryHover'}
        w={'16px'}
        h={'16px'}
        position={'absolute'}
        inset={0}
        opacity={0}
        className={'tag-save-icon-hover'}
      />
    </Box>
  );
};

type TagActionButtonProps = {
  label: string;
  icon: React.ReactElement;
  onClick?: () => void;
  isDisabled?: boolean;
  color?: string;
  hoverColor?: string;
  hoverIconClassName?: string;
};

/** 标签操作按钮固定为 24px 热区和 16px 图标，并统一承载设计稿 tooltip。 */
const TagActionButton = ({
  label,
  icon,
  onClick,
  isDisabled = false,
  color = 'myGray.500',
  hoverColor,
  hoverIconClassName
}: TagActionButtonProps) => (
  <MyTooltip label={label} shouldWrapChildren={false} {...TAG_TOOLTIP_PROPS}>
    <Flex
      as={'button'}
      type={'button'}
      aria-label={label}
      alignItems={'center'}
      justifyContent={'center'}
      w={'24px'}
      h={'24px'}
      borderRadius={'sm'}
      color={color}
      cursor={isDisabled ? 'not-allowed' : 'pointer'}
      aria-disabled={isDisabled}
      _hover={
        isDisabled
          ? undefined
          : {
              bg: 'myGray.05',
              ...(hoverColor ? { color: hoverColor } : {}),
              ...(hoverIconClassName ? { [`& .${hoverIconClassName}`]: { opacity: 1 } } : {})
            }
      }
      onClick={isDisabled ? undefined : onClick}
    >
      {icon}
    </Flex>
  </MyTooltip>
);

/** 选项类标签管理 Popover：支持动态增删选项与回车快速换行编辑。 */
const TagOptionManagePopover = ({ tag }: { tag: DatasetTagType }) => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<string[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleAddOption = () => {
    setOptions((prev) => {
      const next = [...prev, ''];
      setTimeout(() => {
        inputRefs.current[next.length - 1]?.focus();
      }, 50);
      return next;
    });
  };

  const handleUpdateOption = (index: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleRemoveOption = (index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index === options.length - 1) {
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
      p={'6px'}
      borderRadius={'sm'}
      boxShadow={'0px 4px 5px rgba(19, 51, 107, 0.1), 0px 0px 0.5px rgba(19, 51, 107, 0.1)'}
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
          w={'24px'}
          h={'24px'}
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
            gap={'8px'}
            h={'28px'}
            px={'4px'}
            py={'6px'}
            borderRadius={'xs'}
            cursor={'pointer'}
            _hover={{ bg: 'myGray.100' }}
            onClick={handleAddOption}
          >
            <MyIcon name={'common/addLight'} w={'16px'} h={'16px'} color={'primary.700'} />
            <Box fontSize={'12px'} fontWeight={500} lineHeight={'16px'} color={'primary.700'}>
              {t('dataset:tag.add_option')}
            </Box>
          </Flex>

          {options.length > 0 && (
            <Flex maxH={'134px'} overflowY={'auto'} direction={'column'} gap={'2px'} mt={'2px'}>
              {options.map((opt, index) => (
                <Flex key={index} gap={'4px'} alignItems={'center'} w={'full'}>
                  <Input
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    value={opt}
                    flex={1}
                    minW={0}
                    h={'32px'}
                    px={'12px'}
                    fontSize={'12px'}
                    lineHeight={'16px'}
                    borderRadius={'sm'}
                    border={'1px solid'}
                    borderColor={'myGray.200'}
                    placeholder={t('dataset:tag.enter_option')}
                    _focus={{
                      borderColor: 'primary.600',
                      boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)'
                    }}
                    onChange={(e) => handleUpdateOption(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                  />
                  <Flex
                    as={'button'}
                    type={'button'}
                    w={'24px'}
                    h={'24px'}
                    flexShrink={0}
                    alignItems={'center'}
                    justifyContent={'center'}
                    borderRadius={'sm'}
                    cursor={'pointer'}
                    _hover={{ bg: 'myGray.05' }}
                    onClick={() => handleRemoveOption(index)}
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

/**
 * 知识库标签管理弹窗：展示标签名称和类型，并提供新增、重命名、删除操作。
 * 标签与集合的绑定仍在集合标签控件中完成，避免在管理表格中混合两类操作。
 */
const TagManageModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { datasetDetail, allDatasetTags, loadAllDatasetTags, setSearchTagKey } = useContextSelector(
    DatasetPageContext,
    (v) => v
  );

  const tagInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [newTag, setNewTag] = useState<string | undefined>(undefined);
  const [newTagType, setNewTagType] = useState<DatasetCollectionTagType | undefined>(undefined);
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

  const collectionTags = allDatasetTags;

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
        setSearchTagKey('');
        loadAllDatasetTags();
      },
      successToast: t('dataset:tag.delete_success'),
      errorToast: t('dataset:tag.delete_failed')
    }
  );

  const { runAsync: onCreateCollectionTag } = useRequest(
    ({ tag, tagType }: { tag: string; tagType: DatasetCollectionTagType }) =>
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
        setSearchTagKey('');
        loadAllDatasetTags();
      },
      successToast: t('dataset:tag.save_success'),
      errorToast: t('dataset:tag.save_failed')
    }
  );

  const tagTypeOptions = DatasetCollectionTagTypeEnum.exclude(['string']).options.map(
    (tagType) => ({
      label: t(TAG_TYPE_SELECT_LABEL_KEYS[tagType]),
      value: tagType
    })
  );

  const submitNewTag = async () => {
    const tag = newTag?.trim();
    if (!tag || !newTagType || collectionTags.some((item) => item.tag === tag)) return;

    await onCreateCollectionTag({ tag, tagType: newTagType });
    setNewTag(undefined);
    setNewTagType(undefined);
  };

  const submitUpdatedTag = async (tag: DatasetTagType) => {
    const content = currentEditTagContent?.trim();
    if (
      content &&
      content !== tag.tag &&
      !collectionTags.some((item) => item._id !== tag._id && item.tag === content)
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
    newTag?.trim() && newTagType && !collectionTags.some((item) => item.tag === newTag.trim())
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      size={'xl'}
      w={'800px'}
      h={'80vh'}
      minH={'400px'}
      isCentered
      title={
        <Flex alignItems={'center'} gap={'4px'}>
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
        flex: '1 1 auto',
        minH: 0,
        pb: 0,
        overflow: 'hidden'
      }}
      footerStyles={{
        justifyContent: 'flex-start',
        px: 8,
        pt: '8px',
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
          top: '8px',
          right: '8px',
          w: '36px',
          h: '36px'
        }
      }}
    >
      <Flex
        direction={'column'}
        flex={'1 1 auto'}
        minH={0}
        border={'1px solid'}
        borderColor={'myGray.200'}
        borderRadius={'lg'}
        p={'8px'}
        overflow={'hidden'}
      >
        <Box
          display={'grid'}
          gridTemplateColumns={TAG_TABLE_COLUMNS}
          h={'40px'}
          flexShrink={0}
          alignItems={'center'}
          bg={'myGray.100'}
          borderRadius={'sm'}
          color={'myGray.600'}
          fontSize={'12.8px'}
          fontWeight={700}
          letterSpacing={'0.58px'}
          lineHeight={'16px'}
        >
          <Box px={'24px'}>{t('dataset:tag.name')}</Box>
          <Box px={'24px'}>{t('dataset:tag.attribute')}</Box>
          <Box px={'24px'}>{t('common:Operation')}</Box>
        </Box>

        <Box
          flex={'1 1 auto'}
          minH={0}
          overflowY={'auto'}
          display={'flex'}
          flexDirection={'column'}
          fontSize={'14px'}
          lineHeight={'20px'}
          color={'myGray.600'}
        >
          {collectionTags.length === 0 ? (
            <EmptyTip text={t('dataset:dataset.no_tags')} />
          ) : (
            collectionTags.map((tag) => {
              const isEditing = currentEditTag?._id === tag._id;
              const tagType = tag.tagType ?? 'string';
              const editedTagContent = currentEditTagContent?.trim();
              const canSaveEditedTag = Boolean(
                editedTagContent &&
                editedTagContent !== tag.tag &&
                !collectionTags.some(
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
                  <Box px={'24px'} minW={0}>
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
                  <Flex px={'24px'} alignItems={'center'} gap={'4px'}>
                    <Box>{t(TAG_TYPE_LABEL_KEYS[tagType])}</Box>
                    {tagType === 'array' && <TagOptionManagePopover tag={tag} />}
                  </Flex>
                  <Flex px={'24px'} gap={'4px'} alignItems={'center'}>
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
              <Box px={'24px'}>
                <Input
                  ref={tagInputRef}
                  value={newTag}
                  placeholder={t('dataset:tag.enter_name')}
                  maxLength={20}
                  size={'sm'}
                  onChange={(e) => setNewTag(e.target.value)}
                />
              </Box>
              <Box px={'24px'}>
                <MySelect<DatasetCollectionTagType>
                  value={newTagType}
                  placeholder={t('dataset:tag.select_attribute')}
                  list={tagTypeOptions}
                  width={'100%'}
                  h={'36px'}
                  fontSize={'14px'}
                  lineHeight={'20px'}
                  letterSpacing={'0.25px'}
                  onChange={setNewTagType}
                  menuPlacement={'bottom-start'}
                />
              </Box>
              <Flex px={'24px'} gap={'4px'} alignItems={'center'}>
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
      </Flex>
      <DeleteConfirmModal />
    </MyModal>
  );
};

export default React.memo(TagManageModal);
