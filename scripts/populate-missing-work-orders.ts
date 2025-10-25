#!/usr/bin/env tsx

/**
 * Script to populate missing work orders (OT) in invoice items
 *
 * This script addresses the issue where some items in an invoice have work orders
 * while others don't. When an invoice has any items with work orders, it ensures
 * all items in that invoice get the same work order assigned.
 *
 * Usage:
 * npx tsx scripts/populate-missing-work-orders.ts [--dry-run]
 *
 * Options:
 * --dry-run: Show what would be changed without actually making changes
 *
 * Example:
 * npx tsx scripts/populate-missing-work-orders.ts --dry-run
 * npx tsx scripts/populate-missing-work-orders.ts
 */

import { prisma } from '@/lib/db'

interface InvoiceWithWorkOrders {
    id: string
    invoiceCode: string
    provider: {
        name: string
    }
    items: Array<{
        id: string
        material: {
            name: string
        }
        workOrder: string | null
        lineNumber: number | null
    }>
}

interface WorkOrderAnalysis {
    invoiceId: string
    invoiceCode: string
    providerName: string
    totalItems: number
    itemsWithWorkOrder: number
    itemsWithoutWorkOrder: number
    workOrdersPresent: string[]
    itemsToUpdate: Array<{
        id: string
        materialName: string
        lineNumber: number | null
    }>
}

async function analyzeInvoicesForWorkOrderIssues(): Promise<WorkOrderAnalysis[]> {
    console.log('🔍 Analyzing invoices for work order inconsistencies...\n')

    // Find all invoices that have mixed work order status (some items have OT, some don't)
    const invoices = await prisma.invoice.findMany({
        where: {
            AND: [
                {
                    items: {
                        some: {
                            AND: [
                                { workOrder: { not: null } },
                                { workOrder: { not: '' } }
                            ]
                        }
                    }
                },
                {
                    items: {
                        some: {
                            OR: [
                                { workOrder: null },
                                { workOrder: '' }
                            ]
                        }
                    }
                }
            ]
        },
        select: {
            id: true,
            invoiceCode: true,
            provider: {
                select: {
                    name: true
                }
            },
            items: {
                select: {
                    id: true,
                    workOrder: true,
                    lineNumber: true,
                    material: {
                        select: {
                            name: true
                        }
                    }
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    })

    const analyses: WorkOrderAnalysis[] = []

    for (const invoice of invoices) {
        const itemsWithWorkOrder = invoice.items.filter(item => item.workOrder && item.workOrder.trim() !== '')
        const itemsWithoutWorkOrder = invoice.items.filter(item => !item.workOrder || item.workOrder.trim() === '')

        if (itemsWithWorkOrder.length > 0 && itemsWithoutWorkOrder.length > 0) {
            // Get unique work orders present
            const workOrdersPresent = Array.from(new Set(
                itemsWithWorkOrder
                    .map(item => item.workOrder!)
                    .filter(ot => ot.trim() !== '')
            ))

            const analysis: WorkOrderAnalysis = {
                invoiceId: invoice.id,
                invoiceCode: invoice.invoiceCode,
                providerName: invoice.provider.name,
                totalItems: invoice.items.length,
                itemsWithWorkOrder: itemsWithWorkOrder.length,
                itemsWithoutWorkOrder: itemsWithoutWorkOrder.length,
                workOrdersPresent,
                itemsToUpdate: itemsWithoutWorkOrder.map(item => ({
                    id: item.id,
                    materialName: item.material.name,
                    lineNumber: item.lineNumber
                }))
            }

            analyses.push(analysis)
        }
    }

    return analyses
}

async function populateWorkOrders(analyses: WorkOrderAnalysis[], isDryRun: boolean = false): Promise<void> {
    const action = isDryRun ? 'DRY RUN - Would update' : 'Updating'
    console.log(`\n${action} ${analyses.length} invoice(s) with missing work orders...\n`)

    let totalItemsUpdated = 0
    let totalInvoicesProcessed = 0

    for (const analysis of analyses) {
        try {
            // Use the first work order found (consistent with the main processing logic)
            const workOrderToApply = analysis.workOrdersPresent[0]

            console.log(`📄 Invoice: ${analysis.invoiceCode} (${analysis.providerName})`)
            console.log(`   Work order(s) found: ${analysis.workOrdersPresent.join(', ')}`)
            console.log(`   Will apply: ${workOrderToApply}`)
            console.log(`   Items to update: ${analysis.itemsToUpdate.length}`)

            if (!isDryRun) {
                // Update all items without work orders to use the determined work order
                const updateResult = await prisma.invoiceItem.updateMany({
                    where: {
                        id: {
                            in: analysis.itemsToUpdate.map(item => item.id)
                        }
                    },
                    data: {
                        workOrder: workOrderToApply
                    }
                })

                console.log(`   ✅ Updated ${updateResult.count} items`)
                totalItemsUpdated += updateResult.count
            } else {
                console.log(`   📝 Would update ${analysis.itemsToUpdate.length} items`)
                totalItemsUpdated += analysis.itemsToUpdate.length

                // Show details of what would be updated
                analysis.itemsToUpdate.forEach(item => {
                    console.log(`     - ${item.materialName}${item.lineNumber ? ` (Line ${item.lineNumber})` : ''}`)
                })
            }

            console.log('')
            totalInvoicesProcessed++

        } catch (error) {
            console.error(`❌ Failed to process invoice ${analysis.invoiceCode}:`, error)
            // Continue with other invoices
        }
    }

    console.log(`\n${action} Summary:`)
    console.log(`- Invoices processed: ${totalInvoicesProcessed}`)
    console.log(`- Items updated: ${totalItemsUpdated}`)

    if (isDryRun) {
        console.log('\n💡 To apply these changes, run the script without --dry-run')
    }
}

async function main() {
    const args = process.argv.slice(2)
    const isDryRun = args.includes('--dry-run')

    if (isDryRun) {
        console.log('🔍 DRY RUN MODE - No changes will be made\n')
    }

    try {
        // Analyze invoices for work order issues
        const analyses = await analyzeInvoicesForWorkOrderIssues()

        if (analyses.length === 0) {
            console.log('✅ No invoices found with missing work orders. All good!')
            return
        }

        console.log(`Found ${analyses.length} invoice(s) with inconsistent work orders:\n`)

        // Show summary
        analyses.forEach(analysis => {
            console.log(`- ${analysis.invoiceCode} (${analysis.providerName}): ${analysis.itemsWithoutWorkOrder}/${analysis.totalItems} items missing work orders`)
        })

        // Populate missing work orders
        await populateWorkOrders(analyses, isDryRun)

        console.log('\n🎉 Script completed successfully!')

    } catch (error) {
        console.error('❌ Script failed:', error)
        throw error
    }
}

// Run the script
main()
    .then(() => {
        console.log('✅ Done')
        process.exit(0)
    })
    .catch((error) => {
        console.error('❌ Script failed:', error)
        process.exit(1)
    })
