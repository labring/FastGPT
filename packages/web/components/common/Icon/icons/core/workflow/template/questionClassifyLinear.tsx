import React, { useId } from 'react';

type QuestionClassifyLinearLinearProps = React.SVGProps<SVGSVGElement>;

const QuestionClassifyLinearLinear: React.FC<QuestionClassifyLinearLinearProps> = (props) => {
  const gradientId = useId();

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <path
        d="M42 14V8C42 6.89543 41.1046 6 40 6L8 6C6.89543 6 6 6.89543 6 8L6 14C6 15.1046 6.89543 16 8 16L40 16C41.1046 16 42 15.1046 42 14Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M42 40V26C42 24.8954 41.1046 24 40 24L26 24C24.8954 24 24 24.8954 24 26V40C24 41.1046 24.8954 42 26 42H40C41.1046 42 42 41.1046 42 40Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 40L16 26C16 24.8954 15.1046 24 14 24H8C6.89543 24 6 24.8954 6 26L6 40C6 41.1046 6.89543 42 8 42H14C15.1046 42 16 41.1046 16 40Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="24"
          y1="42"
          x2="24"
          y2="6"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#C471FE" />
          <stop offset="1" stopColor="#EA78FE" />
        </linearGradient>
        <linearGradient
          id={gradientId}
          x1="24"
          y1="42"
          x2="24"
          y2="6"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#C471FE" />
          <stop offset="1" stopColor="#EA78FE" />
        </linearGradient>
        <linearGradient
          id={gradientId}
          x1="24"
          y1="42"
          x2="24"
          y2="6"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#C471FE" />
          <stop offset="1" stopColor="#EA78FE" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default QuestionClassifyLinearLinear;
