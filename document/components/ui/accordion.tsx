'use client';

import * as Primitive from '@radix-ui/react-accordion';
import { ChevronRight } from 'lucide-react';
import { type ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export function Accordion({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn(
        'divide-y divide-fd-border overflow-hidden rounded-lg border bg-fd-card',
        className,
      )}
      {...props}
    />
  );
}

export function AccordionItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item className={cn('scroll-m-24', className)} {...props}>
      {children}
    </Primitive.Item>
  );
}

export function AccordionHeader({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Header>) {
  return (
    <Primitive.Header
      className={cn(
        'not-prose flex flex-row items-center text-fd-card-foreground font-medium has-focus-visible:bg-fd-accent',
        className,
      )}
      {...props}
    >
      {children}
    </Primitive.Header>
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        'group flex flex-1 items-center gap-2 px-3 py-2.5 text-start focus-visible:outline-none',
        className,
      )}
      {...props}
    >
      <ChevronRight className="size-4 shrink-0 text-fd-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
      {children}
    </Primitive.Trigger>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      className={cn(
        'overflow-hidden data-[state=closed]:animate-fd-accordion-up data-[state=open]:animate-fd-accordion-down',
        className,
      )}
      {...props}
    >
      {children}
    </Primitive.Content>
  );
}
