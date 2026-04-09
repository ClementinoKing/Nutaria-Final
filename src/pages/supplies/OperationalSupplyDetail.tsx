import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Sparkles } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ResponsiveTable from '@/components/ResponsiveTable'
import { Spinner } from '@/components/ui/spinner'
import { supabase } from '@/lib/supabaseClient'
import { useSettingsTour, type TourStep } from '@/hooks/useSettingsTour'
import SettingsTour from '@/components/tour/SettingsTour'
import { getUserFriendlyErrorMessage } from '@/lib/errorMessages'

interface ProductLookup {
  name: string
  sku: string
}

interface UnitLookup {
  name: string
  symbol: string
}

interface SupplyBatchRow {
  id: number
  lot_no?: string
  product: string
  unit: string
  outer_expression: string
  received_qty: number
  accepted_qty: number
}

interface OperationalEntry {
  id: number
  delivery_reference: string
  received_condition: 'PASS' | 'HOLD' | 'REJECT'
  remarks: string | null
}

interface SupplyRecord {
  id: number
  doc_no: string | null
  supplier_id: number | null
  warehouse_id: number | null
  received_at: string | null
  doc_status: string | null
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '0'
  return new Intl.NumberFormat('en-ZA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

function OperationalSupplyDetail() {
  const { supplyId } = useParams<{ supplyId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [supply, setSupply] = useState<SupplyRecord | null>(null)
  const [operationalEntry, setOperationalEntry] = useState<OperationalEntry | null>(null)
  const [supplyBatches, setSupplyBatches] = useState<Record<string, unknown>[]>([])
  const [supplierLookup, setSupplierLookup] = useState<Record<string, string>>({})
  const [warehouseLookup, setWarehouseLookup] = useState<Record<string, string>>({})
  const [productLookup, setProductLookup] = useState<Record<string, ProductLookup>>({})
  const [unitLookup, setUnitLookup] = useState<Record<string, UnitLookup>>({})
  const [packagingChecks, setPackagingChecks] = useState<Record<string, unknown>[]>([])
  const [packagingItems, setPackagingItems] = useState<Record<string, unknown>[]>([])
  const [packagingParameters, setPackagingParameters] = useState<Record<number, { name: string; code: string }>>({})

  const supplyIdNumber = useMemo(() => {
    const parsed = Number.parseInt(supplyId ?? '', 10)
    return Number.isFinite(parsed) ? parsed : null
  }, [supplyId])

  useEffect(() => {
    if (!supplyIdNumber) {
      setError('Invalid supply id.')
      setLoading(false)
      return
    }

    const state = (location.state ?? {}) as Record<string, unknown>
    const stateSupply = state.supply as SupplyRecord | undefined
    const stateSupplyBatches = state.supplyBatches as Record<string, unknown>[] | undefined
    const stateSupplierLookup = state.supplierLookup as Record<string, string> | undefined
    const stateWarehouseLookup = state.warehouseLookup as Record<string, string> | undefined
    const stateProductLookup = state.productLookup as Record<string, ProductLookup> | undefined
    const stateUnitLookup = state.unitLookup as Record<string, UnitLookup> | undefined

    if (stateSupply?.id === supplyIdNumber) {
      setSupply(stateSupply)
      setSupplyBatches(Array.isArray(stateSupplyBatches) ? stateSupplyBatches : [])
      setSupplierLookup(stateSupplierLookup ?? {})
      setWarehouseLookup(stateWarehouseLookup ?? {})
      setProductLookup(stateProductLookup ?? {})
      setUnitLookup(stateUnitLookup ?? {})
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      const [
        supplyResponse,
        entryResponse,
        batchesResponse,
        suppliersResponse,
        warehousesResponse,
        productsResponse,
        unitsResponse,
        packagingChecksResponse,
        packagingItemsResponse,
        packagingParametersResponse,
      ] = await Promise.all([
        supabase
          .from('supplies')
          .select('id, doc_no, supplier_id, warehouse_id, received_at, doc_status')
          .eq('id', supplyIdNumber)
          .maybeSingle(),
        supabase
          .from('operational_supply_entries')
          .select('id, delivery_reference, received_condition, remarks')
          .eq('supply_id', supplyIdNumber)
          .maybeSingle(),
        supabase
          .from('supply_batches')
          .select('id, lot_no, product_id, unit_id, outer_unit_id, outer_unit_qty, inner_units_per_outer, received_qty, accepted_qty')
          .eq('supply_id', supplyIdNumber),
        supabase.from('suppliers').select('id, name'),
        supabase.from('warehouses').select('id, name'),
        supabase.from('products').select('id, name, sku'),
        supabase.from('units').select('id, name, symbol'),
        supabase.from('supply_packaging_quality_checks').select('*').eq('supply_id', supplyIdNumber),
        supabase.from('supply_packaging_quality_check_items').select('*'),
        supabase.from('packaging_quality_parameters').select('id, name, code'),
      ])

      if (cancelled) return

      if (supplyResponse.error || !supplyResponse.data) {
        setError('Operational supply not found.')
        setLoading(false)
        return
      }

      if (entryResponse.error) {
        setError(getUserFriendlyErrorMessage(entryResponse.error, 'We could not load the operational supply entry. Please refresh and try again.'))
        setLoading(false)
        return
      }

      if (batchesResponse.error) {
        setError(getUserFriendlyErrorMessage(batchesResponse.error, 'We could not load the supply batches. Please refresh and try again.'))
        setLoading(false)
        return
      }
      if (packagingChecksResponse.error) {
        setError(getUserFriendlyErrorMessage(packagingChecksResponse.error, 'We could not load the packaging checks. Please refresh and try again.'))
        setLoading(false)
        return
      }
      if (packagingItemsResponse.error) {
        setError(getUserFriendlyErrorMessage(packagingItemsResponse.error, 'We could not load the packaging check items. Please refresh and try again.'))
        setLoading(false)
        return
      }

      setSupply(supplyResponse.data as SupplyRecord)
      setOperationalEntry((entryResponse.data as OperationalEntry | null) ?? null)
      setSupplyBatches((batchesResponse.data as Record<string, unknown>[]) ?? [])
      const packagingChecksRows = (packagingChecksResponse.data as Record<string, unknown>[]) ?? []
      setPackagingChecks(packagingChecksRows)
      const packagingCheckIds = packagingChecksRows
        .map((row) => Number((row as { id?: number | null }).id))
        .filter((id) => Number.isFinite(id))
      setPackagingItems(
        ((packagingItemsResponse.data as Record<string, unknown>[]) ?? []).filter((item) =>
          packagingCheckIds.includes(Number((item as { packaging_check_id?: number | null }).packaging_check_id)),
        ),
      )
      const packagingParamMap: Record<number, { name: string; code: string }> = {}
      ;((packagingParametersResponse.data as Array<{ id: number; name: string; code: string }>) ?? []).forEach((row) => {
        packagingParamMap[row.id] = { name: row.name, code: row.code }
      })
      setPackagingParameters(packagingParamMap)

      const supplierMap: Record<string, string> = {}
      ;(suppliersResponse.data ?? []).forEach((row) => {
        const item = row as { id: number; name: string | null }
        supplierMap[String(item.id)] = item.name ?? '—'
      })
      setSupplierLookup(supplierMap)

      const warehouseMap: Record<string, string> = {}
      ;(warehousesResponse.data ?? []).forEach((row) => {
        const item = row as { id: number; name: string | null }
        warehouseMap[String(item.id)] = item.name ?? '—'
      })
      setWarehouseLookup(warehouseMap)

      const productMap: Record<string, ProductLookup> = {}
      ;(productsResponse.data ?? []).forEach((row) => {
        const item = row as { id: number; name: string | null; sku: string | null }
        productMap[String(item.id)] = {
          name: item.name ?? 'Unknown product',
          sku: item.sku ?? '',
        }
      })
      setProductLookup(productMap)

      const unitMap: Record<string, UnitLookup> = {}
      ;(unitsResponse.data ?? []).forEach((row) => {
        const item = row as { id: number; name: string | null; symbol: string | null }
        unitMap[String(item.id)] = {
          name: item.name ?? '—',
          symbol: item.symbol ?? '',
        }
      })
      setUnitLookup(unitMap)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [location.state, supplyIdNumber])

  const rows = useMemo<SupplyBatchRow[]>(
    () =>
      supplyBatches.map((line) => {
        const productId = String((line.product_id as number | null) ?? '')
        const unitId = String((line.unit_id as number | null) ?? '')
        const outerUnitId = String((line.outer_unit_id as number | null) ?? '')
        const product = productLookup[productId]
        const unit = unitLookup[unitId]
        const outerUnit = unitLookup[outerUnitId]
        const outerQty =
          line.outer_unit_qty != null && Number.isFinite(Number(line.outer_unit_qty)) ? Number(line.outer_unit_qty) : null
        const innerUnitsPerOuter =
          line.inner_units_per_outer != null && Number.isFinite(Number(line.inner_units_per_outer))
            ? Number(line.inner_units_per_outer)
            : null
        return {
          id: Number(line.id ?? 0),
          lot_no: String((line.lot_no as string | null) ?? ''),
          product: product ? `${product.name}${product.sku ? ` (${product.sku})` : ''}` : '—',
          unit: unit ? `${unit.name}${unit.symbol ? ` (${unit.symbol})` : ''}` : '—',
          outer_expression:
            outerUnit && outerQty != null && innerUnitsPerOuter != null
              ? `${formatNumber(outerQty)} ${outerUnit.name}${outerUnit.symbol ? ` (${outerUnit.symbol})` : ''} x ${formatNumber(innerUnitsPerOuter)}`
              : 'Direct inner-unit receipt',
          received_qty: Number(line.received_qty ?? 0),
          accepted_qty: Number(line.accepted_qty ?? 0),
        }
      }),
    [productLookup, supplyBatches, unitLookup]
  )

  const packagingByBatch = useMemo(
    () =>
      packagingChecks
        .map((check) => {
          const checkId = Number((check as { id?: number | null }).id)
          const lotId = Number((check as { lot_id?: number | null }).lot_id)
          const batch = rows.find((row) => row.id === lotId)
          return {
            check,
            batch,
            items: packagingItems.filter(
              (item) => Number((item as { packaging_check_id?: number | null }).packaging_check_id) === checkId,
            ),
          }
        })
        .filter((entry) => entry.batch && entry.items.length > 0),
    [packagingChecks, packagingItems, rows],
  )

  const totalReceived = useMemo(
    () => rows.reduce((sum, row) => sum + (Number.isFinite(row.received_qty) ? row.received_qty : 0), 0),
    [rows]
  )

  const tourSteps = useMemo<TourStep[]>(
    () => [
      {
        id: 'summary',
        target: '[data-tour="operational-supply-summary"]',
        title: 'Operational supply summary',
        description: 'Review the document, status, and total received at a glance.',
        placement: 'bottom',
      },
      {
        id: 'details',
        target: '[data-tour="operational-supply-details"]',
        title: 'Receiving details',
        description: 'Verify supplier, warehouse, delivery reference, and condition.',
        placement: 'top',
      },
      {
        id: 'batches',
        target: '[data-tour="operational-supply-batches"]',
        title: 'Operational batches',
        description: 'Each line represents an operational item received in this delivery.',
        placement: 'top',
      },
      {
        id: 'packaging',
        target: '[data-tour="operational-supply-packaging"]',
        title: 'Packaging checks',
        description: 'Review packaging quality captured per operational batch.',
        placement: 'top',
      },
    ],
    []
  )

  const {
    closeTour,
    currentStep: currentTourStep,
    currentStepIndex: currentTourStepIndex,
    isLastStep: isTourLastStep,
    isOpen: isTourOpen,
    nextStep,
    openTour,
    previousStep,
  } = useSettingsTour(tourSteps)

  if (loading) {
    return (
      <PageLayout
        title="Operational Supply Detail"
        activeItem="supplies"
        leadingActions={
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => navigate('/inventory/stock-levels/operational-supplies')}
            aria-label="Back to Operational Supplies"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading operational supply..." />
      </PageLayout>
    )
  }

  if (error || !supply) {
    return (
      <PageLayout
        title="Operational Supply Detail"
        activeItem="supplies"
        leadingActions={
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => navigate('/inventory/stock-levels/operational-supplies')}
            aria-label="Back to Operational Supplies"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-red-700">{error ?? 'Unable to load operational supply.'}</CardContent>
        </Card>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Operational Supply Detail"
      activeItem="supplies"
      leadingActions={
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => navigate('/inventory/stock-levels/operational-supplies')}
          aria-label="Back to Operational Supplies"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      }
      actions={
        <>
          <Button variant="outline" onClick={() => void openTour()}>
            <Sparkles className="mr-2 h-4 w-4" />
            Take tour
          </Button>
          <Button
            type="button"
            className="bg-olive hover:bg-olive-dark"
            onClick={() =>
              navigate(`/supplies/${supply.id}/edit`, {
                state: { backgroundLocation: location },
              })
            }
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-tour="operational-supply-summary">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Document</CardDescription>
            <CardTitle className="text-xl text-text-dark">{supply.doc_no ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-xl text-text-dark">{supply.doc_status ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Condition</CardDescription>
            <CardTitle className="text-xl text-text-dark">{operationalEntry?.received_condition ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total Received</CardDescription>
            <CardTitle className="text-xl text-text-dark">{formatNumber(totalReceived)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-6 border-olive-light/30" data-tour="operational-supply-details">
        <CardHeader>
          <CardTitle className="text-text-dark">Operational Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-text-dark/80 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-dark/60">Supplier</p>
            <p className="font-medium text-text-dark">
              {supplierLookup[String(supply.supplier_id ?? '')] ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-dark/60">Warehouse</p>
            <p className="font-medium text-text-dark">
              {warehouseLookup[String(supply.warehouse_id ?? '')] ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-dark/60">Received At</p>
            <p className="font-medium text-text-dark">{formatDateTime(supply.received_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-dark/60">Delivery Reference</p>
            <p className="font-medium text-text-dark">{operationalEntry?.delivery_reference || '—'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-text-dark/60">Remarks</p>
            <p className="font-medium text-text-dark">{operationalEntry?.remarks || '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-olive-light/30" data-tour="operational-supply-batches">
        <CardHeader>
          <CardTitle className="text-text-dark">Supply Batches</CardTitle>
          <CardDescription>Operational products captured for this delivery.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={[
              { key: 'product', header: 'Product', accessor: 'product' },
              {
                key: 'received_as',
                header: 'Received As',
                render: (row: SupplyBatchRow) => (
                  <div>
                    <div className="font-medium text-text-dark">{row.outer_expression}</div>
                    <div className="text-xs text-text-dark/60">Stock unit: {row.unit}</div>
                  </div>
                ),
              },
              {
                key: 'received_qty',
                header: 'Total Items',
                render: (row: SupplyBatchRow) => formatNumber(row.received_qty),
                cellClassName: 'text-right',
                mobileValueClassName: 'text-right',
                headerClassName: 'text-right',
              },
              {
                key: 'accepted_qty',
                header: 'Accepted',
                render: (row: SupplyBatchRow) => formatNumber(row.accepted_qty),
                cellClassName: 'text-right',
                mobileValueClassName: 'text-right',
                headerClassName: 'text-right',
              },
            ]}
            data={rows}
            rowKey="id"
            emptyMessage="No operational batches captured."
          />
        </CardContent>
      </Card>

      {packagingByBatch.length > 0 ? (
        <Card className="mt-6 border-olive-light/30" data-tour="operational-supply-packaging">
          <CardHeader>
            <CardTitle className="text-text-dark">Packaging Quality Parameters</CardTitle>
            <CardDescription>Packaging quality captured for each operational batch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {packagingByBatch.map(({ check, batch, items }) => (
              <div
                key={`packaging-batch-${String((check as { id?: number | null }).id ?? 'unknown')}`}
                className="rounded-xl border border-olive-light/30 bg-white p-4"
              >
                <div className="mb-4">
                  <p className="text-sm font-semibold text-text-dark">
                    {batch?.product ?? 'Unknown product'}
                    {batch?.lot_no ? ` • ${batch.lot_no}` : ''}
                  </p>
                  <p className="text-xs text-text-dark/70">
                    Qty: {formatNumber(batch?.received_qty)} {batch?.unit !== '—' ? batch?.unit : ''}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => {
                    const parameterId = Number((item as { parameter_id?: number | null }).parameter_id)
                    const parameter = packagingParameters[parameterId]
                    const value = (item as { value?: string | null }).value
                    const numericValue = (item as { numeric_value?: number | null }).numeric_value
                    return (
                      <div
                        key={`packaging-item-${String((item as { id?: number | null }).id ?? `${parameterId}`)}`}
                        className="rounded-lg border border-olive-light/30 bg-olive-light/10 px-3 py-2"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                          {parameter?.name ?? 'Unknown Parameter'}
                        </p>
                        <p className="mt-1 text-sm font-medium text-text-dark">
                          {value || (numericValue != null ? String(numericValue) : 'Not recorded')}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <SettingsTour
        open={isTourOpen}
        step={currentTourStep}
        totalSteps={tourSteps.length}
        currentStepIndex={currentTourStepIndex}
        isLastStep={isTourLastStep}
        onBack={previousStep}
        onNext={nextStep}
        onClose={closeTour}
      />
    </PageLayout>
  )
}

export default OperationalSupplyDetail
