import React, { useRef } from 'react';
import { getTimeZoneList } from '@fastgpt/global/common/time/timezone';
import { Select } from '@chakra-ui/react';

const TimezoneSelect = ({ value, onChange }: { value?: string; onChange: (e: string) => void }) => {
  const timezones = useRef(getTimeZoneList());

  return (
    <Select
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
    >
      {timezones.current.map((item) => (
        <option key={item.value} value={item.value}>
          {item.name}
        </option>
      ))}
    </Select>
  );
};

export default React.memo(TimezoneSelect);
