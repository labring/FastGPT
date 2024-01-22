// The number of days left in the month is calculated as 30 days per month, and less than 1 day is calculated as 1 day
export const getMonthRemainingDays = (startDate = new Date()) => {
  const year = startDate.getFullYear();
  const month = startDate.getMonth();
  const endDay = new Date(year, month + 1, 0, 0, 0, 0);
  return calculateDaysBetweenDates(startDate, endDay);
};

export const calculateDaysBetweenDates = (date1: Date, date2: Date) => {
  const oneDay = 24 * 60 * 60 * 1000;
  const firstDate = new Date(date1).getTime();
  const secondDate = new Date(date2).getTime();

  const differenceInTime = Math.abs(secondDate - firstDate);
  const differenceInDays = Math.floor(differenceInTime / oneDay);

  return differenceInDays;
};
