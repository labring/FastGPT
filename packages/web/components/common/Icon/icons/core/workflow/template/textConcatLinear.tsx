import React, { useId } from 'react';

type TextConcatLinearLinearProps = React.SVGProps<SVGSVGElement>;

const TextConcatLinearLinear: React.FC<TextConcatLinearLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M16 16H32M16 24H32M16 32H26M12 4H36C38.2091 4 40 5.79086 40 8V40C40 42.2091 38.2091 44 36 44H12C9.79086 44 8 42.2091 8 40V8C8 5.79086 9.79086 4 12 4Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="24"
          y1="4"
          x2="24"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FEC65A" />
          <stop offset="1" stopColor="#FAA509" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default TextConcatLinearLinear;
