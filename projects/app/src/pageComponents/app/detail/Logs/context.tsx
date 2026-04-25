import React, { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createContext } from 'use-context-selector';
import { useContextSelector } from 'use-context-selector';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import { addDays } from 'date-fns';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { useMultipleSelect } from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import type { AppLogKeysType } from '@fastgpt/global/core/app/logs/type';
import { DefaultAppLogKeys } from '@fastgpt/global/core/app/logs/constants';
import type { SelectedUserType } from './UserFilter';
import { useLocalStorageState } from 'ahooks';
import { AppContext } from '../context';
import { getLogKeys } from '@/web/core/app/api/log';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { isEqual } from 'lodash';
import type { getLogKeysResponseType } from '@fastgpt/global/openapi/core/app/log/api';

export type LogsContextType = {
  dateRange: DateRangeType;
  setDateRange: (value: DateRangeType) => void;
  chatSources: ChatSourceEnum[];
  setChatSources: (value: ChatSourceEnum[]) => void;
  isSelectAllSource: boolean;
  setIsSelectAllSource: Dispatch<SetStateAction<boolean>>;
  chatSearch: string;
  setChatSearch: (value: string) => void;
  selectedUsers: SelectedUserType[];
  setSelectedUsers: Dispatch<SetStateAction<SelectedUserType[]>>;
  isSelectAllUser: boolean;
  setIsSelectAllUser: Dispatch<SetStateAction<boolean>>;
  logKeys: AppLogKeysType[];
  setLogKeys: (value: AppLogKeysType[]) => void;
  teamLogKeys: getLogKeysResponseType | undefined;
  showSyncPopover: boolean;
  fetchLogKeys: () => Promise<getLogKeysResponseType | undefined>;
  total: number;
  setTotal: Dispatch<SetStateAction<number>>;
  onExport: (() => Promise<void>) | undefined;
  setOnExport: (fn: (() => Promise<void>) | undefined) => void;
};

export const LogsContext = createContext<LogsContextType>({} as LogsContextType);

export const LogsContextProvider = ({
  children,
  appId: propsAppId
}: {
  children: React.ReactNode;
  appId?: string;
}) => {
  const contextAppId = useContextSelector(AppContext, (v) => v.appId);
  const appId = propsAppId ?? contextAppId;

  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: new Date(addDays(new Date(), -6).setHours(0, 0, 0, 0)),
    to: new Date(new Date().setHours(23, 59, 59, 999))
  });

  const {
    value: chatSources,
    setValue: setChatSources,
    isSelectAll: isSelectAllSource,
    setIsSelectAll: setIsSelectAllSource
  } = useMultipleSelect<ChatSourceEnum>(Object.values(ChatSourceEnum), true);

  const [chatSearch, setChatSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<SelectedUserType[]>([]);
  const [isSelectAllUser, setIsSelectAllUser] = useState(true);

  const [logKeysStorage, setLogKeysStorage] = useLocalStorageState<AppLogKeysType[]>(
    `app_log_keys_${appId}`
  );
  const logKeys = logKeysStorage ?? DefaultAppLogKeys;
  const setLogKeys = (value: AppLogKeysType[]) => setLogKeysStorage(value);

  const { runAsync: fetchLogKeys, data: teamLogKeys } = useRequest(
    async () => {
      return getLogKeys({ appId });
    },
    {
      manual: false,
      refreshDeps: [appId],
      onSuccess: (res) => {
        if (logKeysStorage && logKeysStorage.length > 0) return;
        if (res.logKeys.length > 0) {
          setLogKeysStorage(res.logKeys);
        } else {
          setLogKeysStorage(DefaultAppLogKeys);
        }
      }
    }
  );

  const showSyncPopover = useMemo(() => {
    const teamList = (
      teamLogKeys?.logKeys?.length ? teamLogKeys.logKeys : DefaultAppLogKeys
    ).filter((item) => item.enable);
    const personalList = logKeys.filter((item) => item.enable);
    return !isEqual(teamList, personalList);
  }, [teamLogKeys, logKeys]);

  const [total, setTotal] = useState(0);
  const [onExport, setOnExportState] = useState<(() => Promise<void>) | undefined>(undefined);

  const setOnExport = (fn: (() => Promise<void>) | undefined) => {
    setOnExportState(() => fn);
  };

  return (
    <LogsContext.Provider
      value={{
        dateRange,
        setDateRange,
        chatSources,
        setChatSources,
        isSelectAllSource,
        setIsSelectAllSource,
        chatSearch,
        setChatSearch,
        selectedUsers,
        setSelectedUsers,
        isSelectAllUser,
        setIsSelectAllUser,
        logKeys,
        setLogKeys,
        teamLogKeys,
        showSyncPopover,
        fetchLogKeys,
        total,
        setTotal,
        onExport,
        setOnExport
      }}
    >
      {children}
    </LogsContext.Provider>
  );
};
