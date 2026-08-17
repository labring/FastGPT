'use client';

import { X } from 'lucide-react';
import { useId, useRef } from 'react';

type CommercialContactDialogProps = {
  url: string;
  label: string;
  title: string;
  description: string;
  closeLabel: string;
};

/**
 * 在商业版文档中居中打开官网咨询页，保持用户当前的阅读位置不变。
 * 使用原生 dialog 以获得 Esc 关闭、焦点回收和移动端适配能力。
 */
export function CommercialContactDialog({
  url,
  label,
  title,
  description,
  closeLabel
}: CommercialContactDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const openDialog = () => {
    dialogRef.current?.showModal();
  };

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        className="cursor-pointer font-medium text-fd-primary underline decoration-fd-primary/40 underline-offset-4 transition-colors hover:decoration-fd-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
      >
        {label}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="docs-contact-dialog"
      >
        <div className="flex size-full min-h-0 flex-col">
          <div
            role="banner"
            className="flex h-14 min-h-0 shrink-0 items-center justify-between gap-3 border-b border-fd-border px-4 py-0 sm:px-5"
          >
            <div className="min-w-0">
              <div
                id={titleId}
                role="heading"
                aria-level={2}
                className="truncate text-lg font-semibold leading-5 text-fd-foreground"
              >
                {title}
              </div>
              <div className="mt-0.5 truncate text-xs leading-4 text-fd-muted-foreground">
                {description}
              </div>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              aria-label={closeLabel}
              className="shrink-0 cursor-pointer rounded-full p-1 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          <iframe
            src={url}
            title={title}
            className="block min-h-0 flex-1 border-0 bg-fd-background"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </dialog>
    </>
  );
}
