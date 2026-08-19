export const formatIST = (dateStr: string | Date | null | undefined): string => {
  if (!dateStr) return 'N/A'
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  // Guard against invalid dates
  if (isNaN(date.getTime())) return 'N/A'
  
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

export const formatINR = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '₹0'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount)
}
