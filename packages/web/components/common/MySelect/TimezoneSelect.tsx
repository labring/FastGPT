import React from 'react';
import { timeZoneList } from '@fastgpt/global/common/time/timezone';
import { Select } from '@chakra-ui/react';

const TimezoneSelect = ({ value, onChange }: { value?: string; onChange: (e: string) => void }) => {
  // 浏览器和旧记录可能保留列表未收录的有效 IANA 别名。
  const currentAlias = (() => {
    if (!value || timeZoneList.some((item) => item.value === value)) return;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: value });
      return value;
    } catch {}
  })();

  return (
    <Select
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
    >
      {currentAlias && <option value={currentAlias}>{currentAlias}</option>}
      {timeZoneList.map((item) => (
        <option key={item.value} value={item.value}>
          {item.name}
        </option>
      ))}
    </Select>
  );
};

export default React.memo(TimezoneSelect);
