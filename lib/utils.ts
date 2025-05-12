import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

export function formatPercentage(value: number): string {
  return `${value}%`
}

export function getQuarterFromMonth(month: number): number {
  return Math.ceil(month / 3)
}

export function getMonthName(month: number): string {
  const date = new Date()
  date.setMonth(month - 1)
  return date.toLocaleString("es-ES", { month: "long" })
}

export function getQuarterName(quarter: number): string {
  return `Q${quarter}`
}
