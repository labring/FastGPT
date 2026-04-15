export type AuthFrequencyLimitProps = {
  eventId: string;
  maxAmount: number;
  expiredTime: Date;
  num?: number;
  /** When true, Mongo errors reject instead of failing open (for login and other strict paths). */
  strict?: boolean;
};
