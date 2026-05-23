import type { ImageSpec } from '@/types';

export function formatImageSpec(image: ImageSpec): string {
  const parts: string[] = [image.repository];
  if (image.tag) parts.push(':', image.tag);
  if (image.digest) parts.push('@', image.digest);
  return parts.join('');
}

export function parseImageSpec(image?: string): ImageSpec {
  if (!image) return { repository: '' };

  const atIndex = image.indexOf('@');
  if (atIndex > -1) {
    return { repository: image.slice(0, atIndex), digest: image.slice(atIndex + 1) };
  }

  const slashIndex = image.lastIndexOf('/');
  const colonIndex = image.lastIndexOf(':');
  if (colonIndex > slashIndex) {
    return { repository: image.slice(0, colonIndex), tag: image.slice(colonIndex + 1) };
  }

  return { repository: image };
}
