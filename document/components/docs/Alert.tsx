import type { ReactNode } from 'react';

interface AlertProps {
  icon?: ReactNode;
  context?: 'success' | 'warning' | 'error' | 'info';
  children: ReactNode;
}

export function Alert({ icon, context = 'info', children }: AlertProps) {
  const contextStyles = {
    success:
      'bg-green-50 border-green-200 text-green-700 dark:bg-white/5 dark:border-teal-300 dark:text-gray-200',
    warning:
      'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-white/5 dark:border-indigo-500 dark:text-gray-200',
    error:
      'bg-red-50 border-red-200 text-red-700 dark:bg-white/5 dark:border-red-800 dark:text-gray-200',
    info: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-white/5 dark:border-blue-400 dark:text-gray-200'
  };

  return (
    <div
      className={`
      ${contextStyles[context]}
      my-4 p-4 rounded-lg border
      flex gap-3 items-start
      shadow-sm
      transition-all duration-200 ease-in-out
      hover:shadow-md
    `}
    >
      {icon ? <div className="text-xl leading-6 flex-shrink-0 select-none">{icon}</div> : null}
      <div className="space-y-2 text-sm leading-relaxed flex-grow [&>p]:my-0 [&>ul]:my-1">
        {children}
      </div>
    </div>
  );
}
