import dayjs from 'dayjs';

export const formatTime2YMDHM = (time?: Date) =>
  time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '';
