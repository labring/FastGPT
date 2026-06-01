import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Button, Checkbox, Flex } from '@chakra-ui/react';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyInput from '@/components/MyInput';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { fileDownload } from '@/web/common/file/utils';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import HighlightText from '@fastgpt/web/components/common/String/HighlightText';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useInputGuideLexicon } from './useInputGuideLexicon';
import type { ChatInputGuideListResponseType } from '@fastgpt/global/openapi/core/chat/inputGuide/api';

const csvTemplate = `"第一列内容"
"只会将第一列内容导入，其余列会被忽略"
"AIGC发展分为几个阶段？"`;

type LexiconItem = ChatInputGuideListResponseType['list'][number];

const downloadCsvTemplate = () => {
  fileDownload({
    text: csvTemplate,
    type: 'text/csv;charset=utf-8',
    filename: 'questionGuide_template.csv'
  });
};

const CommitInput = ({
  defaultValue = '',
  placeholder,
  onCommit
}: {
  defaultValue?: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) => {
  const committedRef = useRef(false);

  const commit = useCallback(
    (value: string) => {
      if (committedRef.current) return;

      committedRef.current = true;
      onCommit(value.trim());
    },
    [onCommit]
  );

  return (
    <MyInput
      autoFocus
      defaultValue={defaultValue}
      placeholder={placeholder}
      rightIcon={<MyIcon name={'save'} boxSize={4} cursor={'pointer'} />}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit(e.currentTarget.value);
          e.currentTarget.blur();
        }
      }}
    />
  );
};

const LexiconToolbar = ({
  onImport,
  onSearch
}: {
  onImport: () => void;
  onSearch: (searchKey: string) => void;
}) => {
  const { t } = useTranslation();

  return (
    <Flex gap={4} px={8} py={4} mb={4} alignItems={'center'} borderBottom={'base'}>
      <Box flex={1}>
        <MyInput
          leftIcon={<MyIcon name={'common/searchLight'} boxSize={4} color={'myGray.500'} />}
          bg={'myGray.50'}
          w={'full'}
          h={9}
          placeholder={t('common:Search')}
          onChange={(e) => onSearch(e.target.value)}
        />
      </Box>
      <Button
        onClick={onImport}
        variant={'whiteBase'}
        size={'sm'}
        leftIcon={<MyIcon name={'common/importLight'} boxSize={4} />}
      >
        {t('common:Import')}
      </Button>
      <Box cursor={'pointer'} onClick={downloadCsvTemplate}>
        <QuestionTip ml={-2} label={t('app:csv_input_lexicon_tip')} />
      </Box>
    </Flex>
  );
};

const LexiconActions = ({
  hasSelectedRows,
  onCreate,
  onDeleteAll,
  onDeleteSelected
}: {
  hasSelectedRows: boolean;
  onCreate: () => void;
  onDeleteAll: () => void;
  onDeleteSelected: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <Flex mb={1} justifyContent={'space-between'}>
      <Box flex={1} />
      <Flex gap={4}>
        <Button
          variant={'whiteBase'}
          display={hasSelectedRows ? 'flex' : 'none'}
          size={'sm'}
          leftIcon={<MyIcon name={'delete'} boxSize={4} />}
          onClick={onDeleteSelected}
        >
          {t('common:Delete')}
        </Button>

        <PopoverConfirm
          Trigger={
            <Button
              variant={'whiteBase'}
              display={hasSelectedRows ? 'none' : 'flex'}
              size={'sm'}
              leftIcon={<MyIcon name={'delete'} boxSize={4} />}
            >
              {t('app:Delete_all')}
            </Button>
          }
          type="delete"
          content={t('app:delete_all_input_guide_confirm')}
          onConfirm={onDeleteAll}
        />

        <Button
          display={hasSelectedRows ? 'none' : 'flex'}
          onClick={onCreate}
          size={'sm'}
          leftIcon={<MyIcon name={'common/addLight'} boxSize={4} />}
        >
          {t('common:Add')}
        </Button>
      </Flex>
    </Flex>
  );
};

const LexiconRow = ({
  hasSelectedRows,
  isEditing,
  item,
  searchKey,
  selected,
  onDelete,
  onEdit,
  onSelect,
  onUpdate
}: {
  hasSelectedRows: boolean;
  isEditing: boolean;
  item: LexiconItem;
  searchKey: string;
  selected: boolean;
  onDelete: (dataId: string) => void;
  onEdit: (dataId: string) => void;
  onSelect: (dataId: string, checked: boolean) => void;
  onUpdate: (data: { text: string; dataId: string }) => void;
}) => {
  return (
    <Flex
      alignItems={'center'}
      h={10}
      mt={2}
      _hover={{
        '& .icon-list': {
          display: 'flex'
        }
      }}
    >
      <Checkbox
        mr={2}
        isChecked={selected}
        icon={<MyIcon name={'common/check'} w={'12px'} />}
        onChange={(e) => onSelect(item._id, e.target.checked)}
      />
      {isEditing ? (
        <Box h={'full'} flex={'1 0 0'}>
          <CommitInput
            defaultValue={item.text}
            onCommit={(text) => {
              onUpdate({
                text,
                dataId: item._id
              });
            }}
          />
        </Box>
      ) : (
        <Flex
          h={'40px'}
          w={0}
          flex={'1 0 0'}
          rounded={'md'}
          px={4}
          bg={'myGray.50'}
          alignItems={'center'}
          border={'base'}
          _hover={{ borderColor: 'primary.300' }}
        >
          <Box className="textEllipsis" w={0} flex={'1 0 0'}>
            <HighlightText rawText={item.text} matchText={searchKey} />
          </Box>
          {!hasSelectedRows && (
            <Box className="icon-list" display={'none'}>
              <MyIcon
                name={'edit'}
                boxSize={4}
                mr={2}
                color={'myGray.600'}
                cursor={'pointer'}
                onClick={() => onEdit(item._id)}
              />
              <MyIcon
                name={'delete'}
                boxSize={4}
                color={'myGray.600'}
                cursor={'pointer'}
                _hover={{ color: 'red.600' }}
                onClick={() => onDelete(item._id)}
              />
            </Box>
          )}
        </Flex>
      )}
    </Flex>
  );
};

const LexiconConfigModal = ({ appId, onClose }: { appId: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const {
    SelectFile,
    ScrollList,
    clearSelectedRows,
    createNewData,
    editDataId,
    isCreatingNewData,
    isLoading,
    onDeleteAllData,
    onDeleteData,
    onOpenSelectFile,
    onSelectFile,
    onSelectRow,
    onStartCreateData,
    onStartEditData,
    onUpdateData,
    scrollDataList,
    searchKey,
    selectedRows,
    setSearchKey
  } = useInputGuideLexicon({ appId });

  const hasSelectedRows = selectedRows.length > 0;

  const handleDeleteSelected = useCallback(() => {
    onDeleteData(selectedRows);
    clearSelectedRows();
  }, [clearSelectedRows, onDeleteData, selectedRows]);

  const handleDeleteAll = useCallback(() => {
    onDeleteAllData();
    clearSelectedRows();
  }, [clearSelectedRows, onDeleteAllData]);

  return (
    <MyModal
      title={t('app:config_input_guide_lexicon_title')}
      isOpen={true}
      onClose={onClose}
      isLoading={isLoading}
      h={'600px'}
      size={'md'}
      bodyStyles={{
        px: 0,
        pt: 4,
        pb: 0
      }}
    >
      <LexiconToolbar onImport={onOpenSelectFile} onSearch={setSearchKey} />

      <Box px={8}>
        <LexiconActions
          hasSelectedRows={hasSelectedRows}
          onCreate={onStartCreateData}
          onDeleteAll={handleDeleteAll}
          onDeleteSelected={handleDeleteSelected}
        />

        {isCreatingNewData && (
          <Box mt={5} ml={scrollDataList.length > 0 ? 7 : 0}>
            <CommitInput
              placeholder={t('app:new_input_guide_lexicon')}
              onCommit={(text) => createNewData([text])}
            />
          </Box>
        )}
      </Box>

      <ScrollList
        px={8}
        flex={'1 0 0'}
        fontSize={'sm'}
        EmptyChildren={<EmptyTip text={t('app:chat_input_guide_lexicon_is_empty')} />}
      >
        {scrollDataList.map(({ data: item }) => (
          <LexiconRow
            key={item._id}
            hasSelectedRows={hasSelectedRows}
            isEditing={editDataId === item._id}
            item={item}
            searchKey={searchKey}
            selected={selectedRows.includes(item._id)}
            onDelete={(dataId) => onDeleteData([dataId])}
            onEdit={onStartEditData}
            onSelect={onSelectRow}
            onUpdate={onUpdateData}
          />
        ))}
      </ScrollList>

      <SelectFile onSelect={onSelectFile} />
    </MyModal>
  );
};

export default React.memo(LexiconConfigModal);
