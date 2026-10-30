import React from 'react';
import { timeZoneList } from '@fastgpt/global/common/time/timezone';
import { Select } from '@chakra-ui/react';

const TimezoneSelect = ({ value, onChange }: { value?: string; onChange: (e: string) => void }) => {
  return (
    <Select
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
    >
      {timeZoneList.map((item) => (
        <option key={item.value} value={item.value}>
          {item.name}
        </option>
      ))}
    </Select>
  );
};

export default React.memo(TimezoneSelect);
