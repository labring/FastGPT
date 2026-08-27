import { Input } from '@chakra-ui/react';

export type InputProps<T = 'text' | 'number'> = {
  placeholder?: string;
  title: string;
  description?: string;
  onChange: (value: any) => void;
  value: T extends 'number' ? number : string;
  type: T;
};

function MyInput({ value, onChange, type, placeholder }: InputProps) {
  return (
    <Input
      placeholder={placeholder}
      value={value}
      onChange={
        type === 'number'
          ? (e) => {
              Number(onChange(e.target.value));
            }
          : (e) => {
              onChange(e.target.value);
            }
      }
    />
  );
}

export default MyInput;
