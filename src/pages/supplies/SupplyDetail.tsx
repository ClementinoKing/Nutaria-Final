import { useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { SUPPLY_QUALITY_PARAMETERS, SupplyQualityParameter } from '@/constants/supplyQuality'

interface QualityParameterWithId extends SupplyQualityParameter {
  id?: number | null
}

interface ProfileEntry {
  full_name?: string
  email?: string
  [key: string]: unknown
}

interface UnitEntry {
  name?: string
  symbol?: string
  [key: string]: unknown
}

interface ProductEntry {
  name?: string
  sku?: string
  [key: string]: unknown
}

interface SupplyLineItem {
  product_id?: number
  product_name?: string
  product?: { name?: string; sku?: string }
  item_name?: string
  name?: string
  product_sku?: string
  sku?: string
  ordered_qty?: number
  qty?: number
  received_qty?: number
  accepted_qty?: number
  unit_id?: number | null
  variance_reason?: string
  [key: string]: unknown
}

interface SupplyBatchItem {
  lot_no?: string
  product_id?: number
  product_name?: string
  product_sku?: string
  received_qty?: number
  accepted_qty?: number
  unit_id?: number | null
  quality_status?: string
  [key: string]: unknown
}

const STATUS_BADGES = {
  RECEIVED: 'bg-blue-100 text-blue-800',
  INSPECTING: 'bg-yellow-100 text-yellow-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}

function formatDateTime(value: string | Date | number | null | undefined): string {
  if (!value) {
    return 'Not set'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Not set'
  }
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDate(value: string | Date | number | null | undefined): string {
  if (!value) {
    return 'Not set'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Not set'
  }
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function SupplyDetail() {
  const { supplyId: _supplyId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const navigationState = location.state ?? {}

  const supply = navigationState.supply ?? null
  const lines = Array.isArray(navigationState.supplyLines) ? navigationState.supplyLines : []
  const batches = Array.isArray(navigationState.supplyBatches) ? navigationState.supplyBatches : []
  const qualityChecks = Array.isArray(navigationState.supplyQualityChecks)
    ? navigationState.supplyQualityChecks
    : []
  const qualityItems = Array.isArray(navigationState.supplyQualityItems)
    ? navigationState.supplyQualityItems
    : []
  const qualityParameters =
    Array.isArray(navigationState.qualityParameters) && navigationState.qualityParameters.length > 0
      ? navigationState.qualityParameters
      : SUPPLY_QUALITY_PARAMETERS

  const supplierLookup = useMemo(
    () => new Map(Object.entries(navigationState.supplierLookup ?? {})),
    [navigationState.supplierLookup],
  )
  const warehouseLookup = useMemo(
    () => new Map(Object.entries(navigationState.warehouseLookup ?? {})),
    [navigationState.warehouseLookup],
  )
  const productLookup = useMemo(
    () => new Map(Object.entries(navigationState.productLookup ?? {})),
    [navigationState.productLookup],
  )
  const unitLookup = useMemo(
    () => new Map(Object.entries(navigationState.unitLookup ?? {})),
    [navigationState.unitLookup],
  )
  const profileLookup = useMemo(
    () => new Map(Object.entries(navigationState.profileLookup ?? {})),
    [navigationState.profileLookup],
  )

  const qualityParameterLookup = useMemo(() => {
    const lookup = new Map()

    qualityParameters.forEach((parameter: QualityParameterWithId) => {
      if (parameter?.id !== undefined && parameter?.id !== null) {
        lookup.set(String(parameter.id), parameter)
      }
      if (parameter?.code) {
        lookup.set(parameter.code, parameter)
      }
    })

    SUPPLY_QUALITY_PARAMETERS.forEach((parameter) => {
      if (!lookup.has(parameter.code)) {
        lookup.set(parameter.code, parameter)
      }
    })

    return lookup
  }, [qualityParameters])

  const qualityEvaluationRows = useMemo(() => {
    if (!Array.isArray(qualityItems) || qualityItems.length === 0) {
      return []
    }

    const orderMap = new Map(
      SUPPLY_QUALITY_PARAMETERS.map((parameter, index) => [parameter.code, index]),
    )

    return qualityItems.map((item) => {
      const metadata =
        qualityParameterLookup.get(String(item.parameter_id)) ||
        (item.parameter_code ? qualityParameterLookup.get(item.parameter_code) : undefined)

      let scoreValue = item.score
      if (typeof scoreValue !== 'number') {
        const parsedScore = Number.parseInt(scoreValue ?? '', 10)
        scoreValue = Number.isFinite(parsedScore) ? parsedScore : null
      }

      const code =
        item.parameter_code ??
        (metadata && 'code' in metadata ? metadata.code : undefined)

      return {
        id: item.id ?? `${item.quality_check_id ?? 'check'}-${item.parameter_id ?? item.parameter_code}`,
        name: item.parameter_name ?? metadata?.name ?? 'Quality parameter',
        specification: item.parameter_specification ?? metadata?.specification ?? '',
        score: scoreValue,
        remarks: item.remarks ?? '',
        code: code ?? null,
        order:
          code && orderMap.has(code) ? orderMap.get(code) : Number.MAX_SAFE_INTEGER,
      }
    })
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
  }, [qualityItems, qualityParameterLookup])

  const primaryQualityCheck = useMemo(() => {
    if (!Array.isArray(qualityChecks) || qualityChecks.length === 0) {
      return null
    }
    return [...qualityChecks].sort((a, b) => {
      const aTime = a?.evaluated_at ? new Date(a.evaluated_at).getTime() : 0
      const bTime = b?.evaluated_at ? new Date(b.evaluated_at).getTime() : 0
      return bTime - aTime
    })[0]
  }, [qualityChecks])

  const overallScoreValue =
    primaryQualityCheck?.overall_score !== undefined && primaryQualityCheck?.overall_score !== null
      ? Number(primaryQualityCheck.overall_score)
      : null

  const handleBack = () => {
    navigate('/supplies')
  }

  if (!supply) {
    return (
      <PageLayout
        title="Supply Detail"
        activeItem="supplies"
        actions={
          <Button variant="outline" onClick={handleBack}>
            Back to Supplies
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Card className="border-olive-light/30">
          <CardHeader>
            <CardTitle className="text-text-dark">Supply not found</CardTitle>
            <CardDescription>
              The supply document you are trying to access could not be located.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-dark/70">
              It may have been removed or the link is outdated. Please return to the supply
              register to continue.
            </p>
          </CardContent>
        </Card>
      </PageLayout>
    )
  }

  const resolveProfileName = (profileId: string | number | null | undefined): string | null => {
    if (!profileId) {
      return null
    }
    const entry = profileLookup.get(String(profileId))
    if (!entry || typeof entry !== 'object') {
      return null
    }
    const profileEntry = entry as ProfileEntry
    const fullName =
      typeof profileEntry.full_name === 'string' ? profileEntry.full_name.trim() : ''
    const email = typeof profileEntry.email === 'string' ? profileEntry.email.trim() : ''
    return fullName || email || null
  }

  const getUnitMeta = (unitId: string | number | null | undefined): UnitEntry | null => {
    if (unitId === undefined || unitId === null) {
      return null
    }
    const entry = unitLookup.get(String(unitId))
    return entry ? (entry as UnitEntry) : null
  }

  const getUnitLabel = (unitId: string | number | null | undefined): string => {
    const meta = getUnitMeta(unitId)
    return meta?.symbol?.trim() || meta?.name?.trim() || ''
  }

  const formatQuantityWithUnit = (value: string | number | null | undefined, unitId: string | number | null | undefined): string => {
    const numeric = Number(value)
    const displayValue = Number.isFinite(numeric)
      ? numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : String(value ?? '0')
    const unitLabel = getUnitLabel(unitId)
    return unitLabel ? `${displayValue} ${unitLabel}` : displayValue
  }

  const getProductMeta = (productId: string | number | null | undefined): ProductEntry | null => {
    if (productId === undefined || productId === null) {
      return null
    }
    const entry = productLookup.get(String(productId))
    return entry ? (entry as ProductEntry) : null
  }

  const summariseQuantityByUnit = (items: { [key: string]: unknown }[], key: string): string => {
    if (!Array.isArray(items) || items.length === 0) {
      return '0'
    }

    const totalsByUnit = items.reduce((accumulator, item) => {
      const unitId = item.unit_id ?? item.unitId ?? null
      const unitKey = unitId !== undefined && unitId !== null ? String(unitId) : ''
      const currentValue = accumulator.get(unitKey) ?? 0
      const numericValue = Number(item?.[key]) || 0
      accumulator.set(unitKey, currentValue + numericValue)
      return accumulator
    }, new Map())

    if (totalsByUnit.size === 0) {
      return '0'
    }

    return Array.from(totalsByUnit.entries())
      .map(([unitKey, value]: [string, number]) => {
        const unitMeta = unitLookup.get(unitKey) as UnitEntry | undefined
        const unitLabel = unitMeta?.symbol?.trim() || unitMeta?.name?.trim() || ''
        const displayValue = value.toLocaleString(undefined, {
          maximumFractionDigits: 2,
          minimumFractionDigits: 0,
        })
        return unitLabel ? `${displayValue} ${unitLabel}` : displayValue
      })
      .join(' · ')
  }

  const totalOrderedSummary = summariseQuantityByUnit(lines, 'ordered_qty')
  const totalReceivedSummary = summariseQuantityByUnit(lines, 'received_qty')
  const totalAcceptedSummary = summariseQuantityByUnit(lines, 'accepted_qty')
  const totalRejectedSummary = summariseQuantityByUnit(lines, 'rejected_qty')

  const lineColumns = [
    {
      key: 'product',
      header: 'Product',
      render: (line: SupplyLineItem) => (
        <div>
          <div className="font-medium text-text-dark">
            {(getProductMeta(line.product_id)?.name?.trim() ??
              line.product_name ??
              line.product?.name ??
              line.item_name ??
              line.name ??
              'Product')}
          </div>
          <div className="text-xs text-text-dark/60">
            {(getProductMeta(line.product_id)?.sku?.trim() ??
              line.product_sku ??
              line.product?.sku ??
              line.sku ??
              'No SKU')}
          </div>
        </div>
      ),
      mobileRender: (line: SupplyLineItem) => (
        <div className="text-right">
          <div className="font-medium text-text-dark">
            {getProductMeta(line.product_id)?.name?.trim() ??
              line.product_name ??
              line.product?.name ??
              line.item_name ??
              line.name ??
              'Product'}
          </div>
          <div className="text-xs text-text-dark/60">
            {getProductMeta(line.product_id)?.sku?.trim() ??
              line.product_sku ??
              line.product?.sku ??
              line.sku ??
              'No SKU'}
          </div>
        </div>
      ),
    },
    {
      key: 'quantities',
      header: 'Qty (Ordered / Received / Accepted)',
      render: (line: SupplyLineItem) => (
        <div className="text-right">
          <p className="font-medium text-text-dark">
            {formatQuantityWithUnit(
              line.ordered_qty ?? line.qty ?? line.received_qty ?? 0,
              line.unit_id,
            )}
          </p>
          <p className="text-xs text-text-dark/60">
            {`${formatQuantityWithUnit(line.received_qty ?? 0, line.unit_id)} received · ${formatQuantityWithUnit(line.accepted_qty ?? 0, line.unit_id)} accepted`}
          </p>
        </div>
      ),
      mobileRender: (line: SupplyLineItem) => (
        <div className="text-right">
          <p className="font-medium text-text-dark">
            {formatQuantityWithUnit(
              line.ordered_qty ?? line.qty ?? line.received_qty ?? 0,
              line.unit_id,
            )}
          </p>
          <p className="text-xs text-text-dark/60">
            {`${formatQuantityWithUnit(line.received_qty ?? 0, line.unit_id)} received · ${formatQuantityWithUnit(line.accepted_qty ?? 0, line.unit_id)} accepted`}
          </p>
        </div>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right text-sm text-text-dark',
      mobileValueClassName: 'text-right text-sm text-text-dark',
    },
    {
      key: 'variance',
      header: 'Variance / Notes',
      render: (line: SupplyLineItem) => String(line.variance_reason || 'On plan'),
      mobileRender: (line: SupplyLineItem) => String(line.variance_reason || 'On plan'),
      cellClassName: 'text-sm text-text-dark/80',
      mobileValueClassName: 'text-right text-sm text-text-dark/80',
    },
  ]

  const batchColumns = [
    {
      key: 'lotProduct',
      header: 'Lot & Product',
      render: (batch: SupplyBatchItem) => (
        <div>
          <p className="font-medium text-text-dark">{String(batch.lot_no ?? '')}</p>
          <p className="text-xs text-text-dark/60">
            {getProductMeta(batch.product_id)?.name?.trim() ?? batch.product_name ?? 'Product'} ·{' '}
            {getProductMeta(batch.product_id)?.sku?.trim() ?? batch.product_sku ?? 'No SKU'}
          </p>
        </div>
      ),
      mobileRender: (batch: SupplyBatchItem) => (
        <div className="text-right">
          <p className="font-medium text-text-dark">{batch.lot_no}</p>
          <p className="text-xs text-text-dark/60">
            {getProductMeta(batch.product_id)?.name?.trim() ?? batch.product_name ?? 'Product'} ·{' '}
            {getProductMeta(batch.product_id)?.sku?.trim() ?? batch.product_sku ?? 'No SKU'}
          </p>
        </div>
      ),
    },
    {
      key: 'quantities',
      header: 'Qty (Received / Accepted)',
      render: (batch: SupplyBatchItem) => (
        <div className="text-right">
          <p className="font-medium text-text-dark">
            {formatQuantityWithUnit(batch.received_qty ?? 0, batch.unit_id)}
          </p>
          <p className="text-xs text-text-dark/60">
            Accepted {formatQuantityWithUnit(batch.accepted_qty ?? 0, batch.unit_id)}
          </p>
        </div>
      ),
      mobileRender: (batch: SupplyBatchItem) => (
        <div className="text-right">
          <p className="font-medium text-text-dark">
            {formatQuantityWithUnit(batch.received_qty ?? 0, batch.unit_id)}
          </p>
          <p className="text-xs text-text-dark/60">
            Accepted {formatQuantityWithUnit(batch.accepted_qty ?? 0, batch.unit_id)}
          </p>
        </div>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right text-sm text-text-dark',
      mobileValueClassName: 'text-right text-sm text-text-dark',
    },
    {
      key: 'quality',
      header: 'Quality Status',
      render: (batch: SupplyBatchItem) => String(batch.quality_status ?? 'PENDING'),
      mobileRender: (batch: SupplyBatchItem) => String(batch.quality_status ?? 'PENDING'),
      cellClassName: 'text-sm text-text-dark/70 uppercase tracking-wide',
      mobileValueClassName: 'text-right text-sm text-text-dark/70',
    },
  ]

  const supplierDisplayName =
    supply.supplier_name ??
    supplierLookup.get(String(supply.supplier_id ?? '')) ??
    null
  const warehouseDisplayName =
    supply.warehouse_name ??
    warehouseLookup.get(String(supply.warehouse_id ?? '')) ??
    null
  const receivedByDisplayName = resolveProfileName(supply.received_by)

  const overviewFacts = [
    {
      label: 'Supplier',
      value: supplierDisplayName ?? 'Not captured',
    },
    {
      label: 'Warehouse',
      value: warehouseDisplayName ?? 'Not assigned',
    },
    { label: 'Reference', value: supply.reference ?? 'No linked reference' },
    {
      label: 'Transport reference',
      value: supply.transport_reference ?? 'Not recorded',
    },
    {
      label: 'Pallets received',
      value:
        supply.pallets_received !== undefined && supply.pallets_received !== null
          ? supply.pallets_received.toLocaleString(undefined, { maximumFractionDigits: 2 })
          : '0',
    },
    {
      label: 'Received by',
      value: receivedByDisplayName ?? 'Not recorded',
    },
  ]

  const scheduleFacts = [
    { label: 'Expected on site', value: formatDateTime(supply.expected_at) },
    { label: 'Received', value: formatDateTime(supply.received_at) },
    { label: 'Created', value: formatDateTime(supply.created_at) },
    { label: 'Last updated', value: formatDateTime(supply.updated_at) },
  ]

  const quantityFacts = [
    { label: 'Ordered', value: totalOrderedSummary },
    { label: 'Received', value: totalReceivedSummary },
    { label: 'Accepted', value: totalAcceptedSummary },
    { label: 'Rejected', value: totalRejectedSummary },
  ]

  return (
    <PageLayout
      title="Supply Detail"
      activeItem="supplies"
      actions={
        <Button variant="outline" onClick={handleBack}>
          Back to Supplies
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="space-y-6">
        <Card className="border-olive-light/40 bg-white">
          <CardContent className="flex flex-col gap-5 px-6 py-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold text-text-dark">{supply.doc_no}</CardTitle>
              <p className="text-sm text-text-dark/70">
                {supplierDisplayName ? `${supplierDisplayName} · ` : ''}
                Created {formatDate(supply.created_at)}
              </p>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">
                Received by {receivedByDisplayName ?? 'Not recorded'}
              </p>
              {supply.notes ? (
                <p className="max-w-xl text-sm text-text-dark/60">{supply.notes}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  STATUS_BADGES[supply.doc_status as keyof typeof STATUS_BADGES] ?? 'bg-gray-100 text-gray-700'
                }`}
              >
                {supply.doc_status}
              </span>
              <span className="inline-flex items-center rounded-full border border-olive-light/60 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-olive-dark">
                {supply.quality_status || 'Quality pending'}
              </span>
              <span className="inline-flex items-center rounded-full bg-olive-light/30 px-3 py-1 text-xs font-medium text-text-dark/70">
                Received {formatDateTime(supply.received_at)}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-olive-light/30 bg-white">
            <CardHeader className="px-6 pt-6 pb-2">
              <CardTitle className="text-base font-semibold text-text-dark">
                Supply Details
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {overviewFacts.map((fact) => (
                  <div key={fact.label} className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      {fact.label}
                    </dt>
                    <dd className="text-sm font-medium text-text-dark">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card className="border-olive-light/30 bg-white">
            <CardHeader className="px-6 pt-6 pb-2">
              <CardTitle className="text-base font-semibold text-text-dark">Timing</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {scheduleFacts.map((fact) => (
                  <div key={fact.label} className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      {fact.label}
                    </dt>
                    <dd className="text-sm font-medium text-text-dark">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card className="border-olive-light/30 bg-white">
            <CardHeader className="px-6 pt-6 pb-2">
              <CardTitle className="text-base font-semibold text-text-dark">Quantities</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {quantityFacts.map((fact) => (
                  <div key={fact.label} className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      {fact.label}
                    </dt>
                    <dd className="text-sm font-medium text-text-dark">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>

        <Card className="border-olive-light/30 bg-white">
          <CardHeader>
            <CardTitle className="text-text-dark">Line items</CardTitle>
            <CardDescription>Quantities received versus accepted for each product.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              columns={lineColumns}
              data={lines}
              rowKey="id"
              tableClassName=""
              mobileCardClassName=""
              getRowClassName={() => ''}
              onRowClick={() => {}}
            />
          </CardContent>
        </Card>

        <Card className="border-olive-light/30 bg-white">
          <CardHeader>
            <CardTitle className="text-text-dark">Batches</CardTitle>
            <CardDescription>Traceability details for lots created during receiving.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              columns={batchColumns}
              data={batches}
              rowKey="id"
              tableClassName=""
              mobileCardClassName=""
              getRowClassName={() => ''}
              onRowClick={() => {}}
            />
          </CardContent>
        </Card>

        <Card className="border-olive-light/30 bg-white">
          <CardHeader>
            <CardTitle className="text-text-dark">Quality checks</CardTitle>
            <CardDescription>Inspection results recorded during receiving.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {qualityEvaluationRows.length === 0 ? (
              primaryQualityCheck ? (
                <div className="space-y-3 text-sm text-text-dark/70">
                  <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wide text-text-dark/70">
                    {primaryQualityCheck?.status ? (
                      <span className="inline-flex items-center rounded-full bg-olive-light/30 px-3 py-1">
                        Status {primaryQualityCheck.status}
                      </span>
                    ) : null}
                    {primaryQualityCheck?.result ? (
                      <span className="inline-flex items-center rounded-full bg-olive-light/30 px-3 py-1">
                        Result {primaryQualityCheck.result}
                      </span>
                    ) : null}
                        {primaryQualityCheck?.evaluated_at ? (
                      <span className="inline-flex items-center rounded-full bg-olive-light/30 px-3 py-1">
                        Evaluated {formatDateTime(primaryQualityCheck.evaluated_at)}
                      </span>
                    ) : null}
                  </div>
                  <p>No parameter-level evaluations were recorded.</p>
                </div>
              ) : (
                <p className="text-sm text-text-dark/70">No quality checks recorded.</p>
              )
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wide text-text-dark/70">
                  {primaryQualityCheck?.status ? (
                    <span className="inline-flex items-center rounded-full bg-olive-light/30 px-3 py-1">
                      Status {primaryQualityCheck.status}
                    </span>
                  ) : null}
                  {primaryQualityCheck?.result ? (
                    <span className="inline-flex items-center rounded-full bg-olive-light/30 px-3 py-1">
                      Result {primaryQualityCheck.result}
                    </span>
                  ) : null}
                  {overallScoreValue !== null && Number.isFinite(overallScoreValue) ? (
                    <span className="inline-flex items-center rounded-full bg-olive-light/30 px-3 py-1">
                      Overall score {overallScoreValue.toFixed(2)}
                    </span>
                  ) : null}
                  {primaryQualityCheck?.evaluated_at ? (
                    <span className="inline-flex items-center rounded-full bg-olive-light/30 px-3 py-1">
                      Evaluated {formatDateTime(primaryQualityCheck.evaluated_at)}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center rounded-full bg-olive-light/30 px-3 py-1">
                    {qualityEvaluationRows.length} parameter
                    {qualityEvaluationRows.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {qualityEvaluationRows.map((row) => (
                    <div
                      key={row.id}
                      className="flex h-full flex-col justify-between rounded-xl border border-olive-light/40 bg-white px-4 py-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-text-dark">{row.name}</p>
                            {row.specification ? (
                              <p className="text-xs text-text-dark/60">{row.specification}</p>
                            ) : null}
                          </div>
                          <span className="text-sm font-semibold text-text-dark">
                            {Number.isFinite(row.score) ? row.score : 'Pending'}
                          </span>
                        </div>
                        <p className="text-xs text-text-dark/70">
                          {row.remarks?.trim() ? row.remarks.trim() : 'No remarks reported'}
                        </p>
                      </div>
                      <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-text-dark/50">
                        Parameter code: {row.code ?? 'N/A'}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}

export default SupplyDetail

