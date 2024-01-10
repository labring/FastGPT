// The number of days left in the month is calculated as 30 days per month, and less than 1 day is calculated as 1 day
export const getMonthRemainingDays = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  const days = new Date(year, month + 1, 0).getDate();
  const remainingDays = days - date;
  return remainingDays + 1;
};
