import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

export function relativeTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 45) return "just now";
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2629800, "week"],
    [31557600, "month"],
  ];
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  let unit: Intl.RelativeTimeFormatUnit = "year";
  let value2 = diff / 31557600;
  for (let i = 0; i < units.length; i += 1) {
    if (diff < units[i][0]) {
      unit = units[i][1];
      value2 = diff / (i === 0 ? 1 : units[i - 1][0]);
      break;
    }
  }
  return rtf.format(-Math.round(value2), unit);
}

export function humanize(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function truncateMiddle(value: string, keep = 10): string {
  if (value.length <= keep * 2 + 3) return value;
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}
