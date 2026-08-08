import type { AppLanguage } from "@/lib/i18n";

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatNumber(value: number, language: AppLanguage): string {
  return new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDecimal(value: number, language: AppLanguage): string {
  return new Intl.NumberFormat(language === "fa" ? "fa-IR" : "en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatMoney(value: number, language: AppLanguage): string {
  return formatNumber(value, language);
}

export function formatDuration(value: number, language: AppLanguage): string {
  if (!Number.isFinite(value) || value < 0) {
    return language === "fa" ? "۰۰:۰۰" : "00:00";
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const raw = `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;
  return language === "fa" ? raw.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]) : raw;
}

export function formatReadableShamsiDate(
  isoDate: string,
  language: AppLanguage,
): string {
  return new Intl.DateTimeFormat(
    language === "fa" ? "fa-IR-u-ca-persian" : "en-u-ca-persian-nu-latn",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  ).format(parseIsoDate(isoDate));
}

export function formatReadableShamsiWeekRange(
  startIso: string,
  endIso: string,
  language: AppLanguage,
): string {
  const joiner = language === "fa" ? " تا " : " to ";
  return `${formatReadableShamsiDate(startIso, language)}${joiner}${formatReadableShamsiDate(
    endIso,
    language,
  )}`;
}

function getPersianDateParts(isoDate: string, language: AppLanguage) {
  const parts = new Intl.DateTimeFormat(
    language === "fa" ? "fa-IR-u-ca-persian" : "en-u-ca-persian-nu-latn",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  ).formatToParts(parseIsoDate(isoDate));

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "",
    month: parts.find((part) => part.type === "month")?.value ?? "",
    day: parts.find((part) => part.type === "day")?.value ?? "",
  };
}

export function formatCompactShamsiWeekRange(
  startIso: string,
  endIso: string,
  language: AppLanguage,
): string {
  const start = getPersianDateParts(startIso, language);
  const end = getPersianDateParts(endIso, language);
  const joiner = language === "fa" ? " تا " : " to ";

  if (start.year === end.year && start.month === end.month) {
    return `${start.day}${joiner}${end.day} ${end.month} ${end.year}`;
  }

  if (start.year === end.year) {
    return `${start.day} ${start.month}${joiner}${end.day} ${end.month} ${end.year}`;
  }

  return `${start.day} ${start.month} ${start.year}${joiner}${end.day} ${end.month} ${end.year}`;
}
