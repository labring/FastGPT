export function isForbidden({ expires, forbidden }: { expires: Date; forbidden?: boolean }) {
  return forbidden || new Date(expires) < new Date();
}
