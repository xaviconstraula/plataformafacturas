import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { formatCurrency } from "@/lib/utils"
import { getDashboardStats } from "@/lib/mock-data"

export function RecentInvoices() {
  const { recentInvoices } = getDashboardStats()

  return (
    <div className="space-y-8">
      {recentInvoices.map((invoice) => (
        <div key={invoice.id} className="flex items-center">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary">
              {invoice.supplier.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="ml-4 space-y-1">
            <p className="text-sm font-medium leading-none">{invoice.supplier}</p>
            <p className="text-sm text-muted-foreground">{invoice.material}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm font-medium">{formatCurrency(invoice.amount)}</p>
            <p className="text-sm text-muted-foreground">{new Date(invoice.date).toLocaleDateString("es-ES")}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
