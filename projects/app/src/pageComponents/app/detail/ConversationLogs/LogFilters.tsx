/**
 * @file 日志筛选组件
 * @description 智能客服应用的对话日志筛选功能，包含日期、反馈、来源等多维度筛选和搜索功能
 */
import { Box, Flex, HStack, Input } from '@chakra-ui/react';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatSourceMap } from '@fastgpt/global/core/chat/constants';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import DateRangePicker from '@fastgpt/web/components/common/DateRangePicker';
import { addDays } from 'date-fns';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { FeedbackFilterEnum } from '@fastgpt/global/core/chat/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SyncLogKeysPopover from '../Logs/SyncLogKeysPopover';
import LogKeysConfigPopover from '../Logs/LogKeysConfigPopover';
import { useLocalStorageState } from 'ahooks';
import { getLogKeys } from '@/web/core/app/api/log';
import type { AppLogKeysType } from '@fastgpt/global/core/app/logs/type';
import { DefaultAssistantLogKey } from '@fastgpt/global/core/app/logs/constants';
import { isEqual } from 'lodash';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';

// 反馈筛选组件
const FeedbackSelect = ({
  value,
  onChange,
  isSelectAll,
  setIsSelectAll
}: {
  value: FeedbackFilterEnum[];
  onChange: (value: FeedbackFilterEnum[]) => void;
  isSelectAll: boolean;
  setIsSelectAll: (value: boolean) => void;
}) => {
  const { t } = useTranslation();
  // 反馈筛选选项列表
  const feedbackList = [
    { label: t('app:logs_good_feedback'), value: FeedbackFilterEnum.good },
    { label: t('app:logs_bad_feedback'), value: FeedbackFilterEnum.bad },
    { label: t('app:logs_keys_feedback_none'), value: FeedbackFilterEnum.noFeedback }
  ];

  return (
    <MultipleSelect<FeedbackFilterEnum>
      list={feedbackList}
      value={value}
      onSelect={onChange}
      isSelectAll={isSelectAll}
      setIsSelectAll={(value) => setIsSelectAll(value as boolean)}
      h={10}
      w={'150px'}
      bg={'white'}
      rounded={'8px'}
      tagStyle={{
        px: 1,
        py: 1,
        borderRadius: 'sm',
        bg: 'myGray.100',
        color: 'myGray.900'
      }}
      borderColor={'myGray.200'}
      formLabel={t('app:logs_keys_feedback_column')}
      formLabelFontSize={'sm'}
    />
  );
};

interface LogFiltersProps {
  appId: string;
  onFiltersChange: (filters: LogFiltersType) => void;
  initialFilters?: Partial<LogFiltersType>;
}

export interface LogFiltersType {
  dateRange: DateRangeType;
  chatSources: ChatSourceEnum[];
  isSelectAllSource: boolean;
  selectTmbIds: string[];
  isSelectAllTmb: boolean;
  feedbackFilters: FeedbackFilterEnum[];
  isSelectAllFeedback: boolean;
  chatSearch: string;
  logKeys: AppLogKeysType[];
}

const LogFilters: React.FC<LogFiltersProps> = ({ appId, onFiltersChange, initialFilters }) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  // 日期范围
  const [dateRange, setDateRange] = useState<DateRangeType>(
    initialFilters?.dateRange || {
      from: new Date(addDays(new Date(), -6).setHours(0, 0, 0, 0)),
      to: new Date(new Date().setHours(23, 59, 59, 999))
    }
  );

  // source
  const sourceList = useMemo(
    () =>
      Object.entries(ChatSourceMap).map(([key, value]) => ({
        label: t(value.name as any),
        value: key as ChatSourceEnum
      })),
    [t]
  );

  const {
    value: chatSources,
    setValue: setChatSources,
    isSelectAll: isSelectAllSource,
    setIsSelectAll: setIsSelectAllSource
  } = useMultipleSelect<ChatSourceEnum>(
    initialFilters?.chatSources || Object.values(ChatSourceEnum),
    initialFilters?.isSelectAllSource !== false
  );

  // member
  const [tmbInputValue, setTmbInputValue] = useState('');
  const { data: members, ScrollData: TmbScrollData } = useScrollPagination(getTeamMembers, {
    params: { searchKey: tmbInputValue },
    disabled: !feConfigs?.isPlus
  });
  const tmbList = useMemo(
    () =>
      members.map((item) => ({
        label: (
          <HStack spacing={1}>
            <Avatar src={item.avatar} w={'1.2rem'} rounded={'full'} />
            <Box color={'myGray.900'} className="textEllipsis">
              {item.memberName}
            </Box>
          </HStack>
        ),
        value: item.tmbId
      })),
    [members]
  );
  const {
    value: selectTmbIds,
    setValue: setSelectTmbIds,
    isSelectAll: isSelectAllTmb,
    setIsSelectAll: setIsSelectAllTmb
  } = useMultipleSelect<string>(
    initialFilters?.selectTmbIds || [],
    initialFilters?.isSelectAllTmb !== false
  );

  // feedback
  const {
    value: feedbackFilters,
    setValue: setFeedbackFilters,
    isSelectAll: isSelectAllFeedback,
    setIsSelectAll: setIsSelectAllFeedback
  } = useMultipleSelect<FeedbackFilterEnum>(
    initialFilters?.feedbackFilters || Object.values(FeedbackFilterEnum),
    initialFilters?.isSelectAllFeedback !== false
  );

  // chat
  const [chatSearch, setChatSearch] = useState(initialFilters?.chatSearch || '');

  // log keys
  const [logKeys = DefaultAssistantLogKey, setLogKeys] = useLocalStorageState<AppLogKeysType[]>(
    `app_assistant_log_keys_${appId}`,
    { defaultValue: initialFilters?.logKeys || DefaultAssistantLogKey }
  );
  const { runAsync: fetchLogKeys, data: teamLogKeys } = useRequest(
    async () => {
      return getLogKeys({ appId });
    },
    {
      manual: false,
      refreshDeps: [appId],
      onSuccess: (res) => {
        if (logKeys.length > 0) return;
        if (res.logKeys.length > 0) {
          setLogKeys(res.logKeys);
        } else if (res.logKeys.length === 0) {
          setLogKeys(DefaultAssistantLogKey);
        }
      }
    }
  );
  const showSyncPopover = useMemo(() => {
    const teamLogKeysList = (
      teamLogKeys?.logKeys?.length ? teamLogKeys?.logKeys : DefaultAssistantLogKey
    ).filter((item) => item.enable);
    const personalLogKeysList = logKeys.filter((item) => item.enable);
    return !isEqual(teamLogKeysList, personalLogKeysList);
  }, [teamLogKeys, logKeys]);

  // 使用 useRef 来保存 onFiltersChange 的最新引用，避免依赖变化
  const onFiltersChangeRef = React.useRef(onFiltersChange);
  onFiltersChangeRef.current = onFiltersChange;

  // 当任何筛选条件变化时，触发回调
  const triggerFiltersChange = useCallback(() => {
    const filters: LogFiltersType = {
      dateRange,
      chatSources,
      isSelectAllSource,
      selectTmbIds,
      isSelectAllTmb,
      feedbackFilters,
      isSelectAllFeedback,
      chatSearch,
      logKeys
    };
    onFiltersChangeRef.current(filters);
  }, [
    dateRange,
    chatSources,
    isSelectAllSource,
    selectTmbIds,
    isSelectAllTmb,
    feedbackFilters,
    isSelectAllFeedback,
    chatSearch,
    logKeys
  ]);

  // 监听各个筛选条件的变化
  React.useEffect(() => {
    triggerFiltersChange();
  }, [triggerFiltersChange]);

  return (
    <Flex alignItems={'center'} gap={2} flexWrap={'wrap'}>
      {/* 日期筛选 - 置前 */}
      <Flex>
        <DateRangePicker
          defaultDate={dateRange}
          onSuccess={(date) => {
            setDateRange(date);
          }}
          bg={'myGray.25'}
          h={10}
          flex={'0 1 250px'}
          rounded={'8px'}
          borderColor={'myGray.200'}
          formLabel={t('app:logs_date')}
          _hover={{
            borderColor: 'primary.300'
          }}
        />
      </Flex>

      {/* 反馈筛选 */}
      <Flex>
        <FeedbackSelect
          value={feedbackFilters}
          onChange={setFeedbackFilters}
          isSelectAll={isSelectAllFeedback}
          setIsSelectAll={setIsSelectAllFeedback}
        />
      </Flex>

      {/* 来源筛选 */}
      <Flex>
        <MultipleSelect<ChatSourceEnum>
          list={sourceList}
          value={chatSources}
          onSelect={setChatSources}
          isSelectAll={isSelectAllSource}
          setIsSelectAll={setIsSelectAllSource}
          h={10}
          w={'150px'}
          rounded={'8px'}
          tagStyle={{
            px: 1,
            py: 1,
            borderRadius: 'sm',
            bg: 'myGray.100',
            color: 'myGray.900'
          }}
          borderColor={'myGray.200'}
          formLabel={t('app:logs_source')}
          formLabelFontSize={'sm'}
        />
      </Flex>

      {/* 团队成员筛选 */}
      {feConfigs?.isPlus && (
        <Flex>
          <MultipleSelect<string>
            list={tmbList}
            value={selectTmbIds}
            onSelect={(val) => {
              setSelectTmbIds(val as string[]);
            }}
            ScrollData={TmbScrollData}
            isSelectAll={isSelectAllTmb}
            setIsSelectAll={setIsSelectAllTmb}
            h={10}
            w={'150px'}
            rounded={'8px'}
            formLabelFontSize={'sm'}
            formLabel={t('app:logs_chat_user')}
            tagStyle={{
              px: 1,
              borderRadius: 'sm',
              bg: 'myGray.100',
              w: '76px'
            }}
            inputValue={tmbInputValue}
            setInputValue={setTmbInputValue}
          />
        </Flex>
      )}

      {/* 搜索 */}
      <Flex
        flex={'0 1 180px'}
        h={10}
        alignItems={'center'}
        rounded={'8px'}
        border={'1px solid'}
        borderColor={'myGray.200'}
        _focusWithin={{
          borderColor: 'primary.600',
          boxShadow: '0 0 0 2.4px rgba(51, 112, 255, 0.15)'
        }}
        px={3}
      >
        <Box rounded={'8px'} bg={'white'} fontSize={'sm'} border={'none'} whiteSpace={'nowrap'}>
          {t('common:chat')}
        </Box>
        <Box w={'1px'} h={'12px'} bg={'myGray.200'} mx={2} />
        <Input
          placeholder={t('app:logs_search_title')}
          value={chatSearch}
          onChange={(e) => setChatSearch(e.target.value)}
          fontSize={'sm'}
          border={'none'}
          pl={0}
          _focus={{
            boxShadow: 'none'
          }}
          _placeholder={{
            fontSize: 'sm'
          }}
        />
      </Flex>
      <Box flex={'1'} />
      {showSyncPopover && (
        <SyncLogKeysPopover
          logKeys={logKeys}
          setLogKeys={setLogKeys}
          teamLogKeys={teamLogKeys?.logKeys?.length ? teamLogKeys?.logKeys : DefaultAssistantLogKey}
          fetchLogKeys={fetchLogKeys}
        />
      )}
      <LogKeysConfigPopover logKeysList={logKeys} setLogKeysList={setLogKeys} isAssistant={true} />
    </Flex>
  );
};

export default React.memo(LogFilters);
