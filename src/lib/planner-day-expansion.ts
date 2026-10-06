export function initialOpenDays(dayDates: string[], selectedDate: string, wide: boolean): string[] {
  return wide ? [...dayDates] : dayDates.includes(selectedDate) ? [selectedDate] : dayDates.slice(0, 1);
}

export function revealDay(openDates: string[], dayDate: string, wide: boolean): string[] {
  return wide ? [...new Set([...openDates, dayDate])] : [dayDate];
}

export function toggleDay(openDates: string[], dayDate: string, wide: boolean): string[] {
  return openDates.includes(dayDate)
    ? openDates.filter((date) => date !== dayDate)
    : revealDay(openDates, dayDate, wide);
}

export function phoneOpenDays(openDates: string[], selectedDate: string): string[] {
  if (openDates.length === 0) return [];
  return [openDates.includes(selectedDate) ? selectedDate : [...openDates].sort()[0]];
}
