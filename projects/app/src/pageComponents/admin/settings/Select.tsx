import { Select } from '@chakra-ui/react';
import React from 'react';
import type { ChangeHandler } from 'react-hook-form';

const MySelect = React.forwardRef<
  HTMLSelectElement,
  {
    name: string;
    onChange: ChangeHandler;
    options: Array<{
      label: string;
      value: string;
    }>;
  }
>(({ options, name, onChange }, ref) => {
  return (
    <Select ref={ref} onChange={onChange} name={name} w="200px">
      {options.map((item, index) => (
        <option key={index} value={item.value}>
          {item.label}
        </option>
      ))}
    </Select>
  );
});

MySelect.displayName = 'MySelect';
export default MySelect;
