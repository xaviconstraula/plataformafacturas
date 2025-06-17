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

export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat("es-ES", {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(dateObj)
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
