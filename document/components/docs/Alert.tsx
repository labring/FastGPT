import type { ReactNode } from 'react';

interface AlertProps {
  icon: ReactNode;
  context: 'success' | 'warning' | 'error' | 'info';
  children: ReactNode;
}

export function Alert({ icon, context = 'info', children }: AlertProps) {
  const contextStyles = {
    success:
      'bg-green-50 border-green-200 text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-gray-200',
    warning:
      'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-950 dark:border-yellow-800 dark:text-gray-200',
    error:
      'bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-gray-200',
    info: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-gray-200'
  };

  return (
    <div
      className={`
      ${contextStyles[context]}
      p-4 rounded-lg border
      flex gap-3 items-start
      shadow-sm
      transition-all duration-200 ease-in-out
      hover:shadow-md
    `}
    >
      <div className="text-2xl flex-shrink-0 mt-0.5">{icon}</div>
      <div className="space-y-2 text-sm leading-relaxed flex-grow">{children}</div>
    </div>
  );
}
