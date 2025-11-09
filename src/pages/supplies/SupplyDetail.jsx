import { useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import {
  mockSupplies,
  mockSupplyActivities,
  mockSupplyBatches,
  mockSupplyDocuments,
  mockSupplyLines,
} from '@/data/mockSupplies'
import { SUPPLY_QUALITY_PARAMETERS } from '@/constants/supplyQuality'

const STATUS_BADGES = {
  RECEIVED: 'bg-blue-100 text-blue-800',
  INSPECTING: 'bg-yellow-100 text-yellow-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}

function formatDateTime(value) {
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

function formatDate(value) {
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
  const { supplyId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const { supply, lines, batches, qualityChecks, qualityItems, qualityParameters } = useMemo(() => {
    const passedSupply = location.state?.supply
    const fallbackSupply =
      mockSupplies.find((entry) => String(entry.id) === String(supplyId)) ?? null

    const resolvedSupply = passedSupply ?? fallbackSupply

    if (!resolvedSupply) {
      return {
        supply: null,
        lines: [],
        batches: [],
        qualityChecks: [],
        qualityItems: [],
        qualityParameters: SUPPLY_QUALITY_PARAMETERS,
      }
    }

    const passedLines = Array.isArray(location.state?.supplyLines)
      ? location.state.supplyLines
      : null

    const passedBatches = Array.isArray(location.state?.supplyBatches)
      ? location.state.supplyBatches
      : null

    const passedQualityChecks = Array.isArray(location.state?.supplyQualityChecks)
      ? location.state.supplyQualityChecks
      : null

    const passedQualityItems = Array.isArray(location.state?.supplyQualityItems)
      ? location.state.supplyQualityItems
      : null

    const passedQualityParameters = Array.isArray(location.state?.qualityParameters)
      ? location.state.qualityParameters
      : null

    return {
      supply: resolvedSupply,
      lines:
        passedLines ??
        mockSupplyLines.filter((line) => line.supply_id === resolvedSupply.id),
      batches:
        passedBatches ??
        mockSupplyBatches.filter((batch) => batch.supply_id === resolvedSupply.id),
      qualityChecks: passedQualityChecks ?? [],
      qualityItems: passedQualityItems ?? [],
      qualityParameters: passedQualityParameters ?? SUPPLY_QUALITY_PARAMETERS,
    }
  }, [location.state, supplyId])

  const activities = useMemo(
    () =>
      mockSupplyActivities
        .filter((activity) => activity.supply_id === supply?.id)
        .sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ),
    [supply?.id]
  )

  const documents = useMemo(
    () => mockSupplyDocuments.filter((doc) => doc.supply_id === supply?.id),
    [supply?.id]
  )

  const certificateDocuments = useMemo(
    () =>
      documents.filter((doc) => doc.type && doc.type.toLowerCase().includes('cert')),
    [documents]
  )

  const certificateCount = certificateDocuments.length

  const documentTypeCounts = useMemo(() => {
    return documents.reduce((accumulator, document) => {
      const key = document.type?.trim() || 'Uncategorised'
      accumulator[key] = (accumulator[key] ?? 0) + 1
      return accumulator
    }, {})
  }, [documents])

  const qualityParameterLookup = useMemo(() => {
    const lookup = new Map()

    qualityParameters.forEach((parameter) => {
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

  const totalReceived = lines.reduce((total, line) => total + (line.received_qty ?? 0), 0)
  const totalAccepted = lines.reduce((total, line) => total + (line.accepted_qty ?? 0), 0)
  const totalRejected = lines.reduce((total, line) => total + (line.rejected_qty ?? 0), 0)

  const lineColumns = [
    {
      key: 'product',
      header: 'Product',
      render: (line) => (
        <div>
          <div className="font-medium text-text-dark">{line.product_name}</div>
          <div className="text-xs text-text-dark/60">{line.product_sku}</div>
        </div>
      ),
      mobileRender: (line) => (
        <div className="text-right">
          <div className="font-medium text-text-dark">{line.product_name}</div>
          <div className="text-xs text-text-dark/60">{line.product_sku}</div>
        </div>
      ),
    },
    {
      key: 'ordered',
      header: 'Ordered Qty',
      render: (line) => `${line.ordered_qty ?? line.qty ?? line.received_qty ?? 0} ${line.unit ?? ''}`,
      mobileRender: (line) =>
        `${line.ordered_qty ?? line.qty ?? line.received_qty ?? 0} ${line.unit ?? ''}`,
      headerClassName: 'text-right',
      cellClassName: 'text-right text-sm text-text-dark',
      mobileValueClassName: 'text-right text-sm text-text-dark',
    },
    {
      key: 'received',
      header: 'Received Qty',
      render: (line) => `${line.received_qty ?? 0} ${line.unit ?? ''}`,
      mobileRender: (line) => `${line.received_qty ?? 0} ${line.unit ?? ''}`,
      headerClassName: 'text-right',
      cellClassName: 'text-right text-sm text-text-dark',
      mobileValueClassName: 'text-right text-sm text-text-dark',
    },
    {
      key: 'accepted',
      header: 'Accepted Qty',
      render: (line) => `${line.accepted_qty ?? 0} ${line.unit ?? ''}`,
      mobileRender: (line) => `${line.accepted_qty ?? 0} ${line.unit ?? ''}`,
      headerClassName: 'text-right',
      cellClassName: 'text-right font-medium text-text-dark',
      mobileValueClassName: 'text-right font-medium text-text-dark',
    },
    {
      key: 'variance',
      header: 'Variance',
      render: (line) => line.variance_reason || '—',
      mobileRender: (line) => line.variance_reason || '—',
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-right text-sm text-text-dark/70',
    },
  ]

  const batchColumns = [
    {
      key: 'lot',
      header: 'Lot Number',
      accessor: 'lot_no',
      cellClassName: 'font-medium text-text-dark',
      mobileValueClassName: 'text-text-dark',
    },
    {
      key: 'product',
      header: 'Product',
      render: (batch) => (
        <div>
          <div className="font-medium text-text-dark">{batch.product_name}</div>
          <div className="text-xs text-text-dark/60">{batch.product_sku}</div>
        </div>
      ),
      mobileRender: (batch) => (
        <div className="text-right">
          <div className="font-medium text-text-dark">{batch.product_name}</div>
          <div className="text-xs text-text-dark/60">{batch.product_sku}</div>
        </div>
      ),
    },
    {
      key: 'received',
      header: 'Received Qty',
      render: (batch) => `${batch.received_qty ?? 0} ${batch.unit ?? ''}`,
      mobileRender: (batch) => `${batch.received_qty ?? 0} ${batch.unit ?? ''}`,
      headerClassName: 'text-right',
      cellClassName: 'text-right text-sm text-text-dark',
      mobileValueClassName: 'text-right text-sm text-text-dark',
    },
    {
      key: 'accepted',
      header: 'Accepted Qty',
      render: (batch) => `${batch.accepted_qty ?? 0} ${batch.unit ?? ''}`,
      mobileRender: (batch) => `${batch.accepted_qty ?? 0} ${batch.unit ?? ''}`,
      headerClassName: 'text-right',
      cellClassName: 'text-right font-medium text-text-dark',
      mobileValueClassName: 'text-right font-medium text-text-dark',
    },
    {
      key: 'quality',
      header: 'Quality Status',
      render: (batch) => batch.quality_status ?? 'PENDING',
      mobileRender: (batch) => batch.quality_status ?? 'PENDING',
      cellClassName: 'text-sm text-text-dark/70 uppercase tracking-wide',
      mobileValueClassName: 'text-right text-sm text-text-dark/70',
    },
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
        <Card className="overflow-hidden border-olive-light/40 bg-gradient-to-r from-olive-light/40 via-white to-white">
          <CardContent className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold text-text-dark">{supply.doc_no}</CardTitle>
              <p className="text-sm text-text-dark/70">
                {supply.supplier_name ? `${supply.supplier_name} · ` : ''}
                Created {formatDate(supply.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  STATUS_BADGES[supply.doc_status] ?? 'bg-gray-100 text-gray-700'
                }`}
              >
                {supply.doc_status}
              </span>
              <span className="inline-flex items-center rounded-full border border-olive-light/60 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-olive-dark">
                {supply.quality_status || 'Quality pending'}
              </span>
              <span className="inline-flex items-center rounded-full bg-beige/40 px-3 py-1 text-xs font-medium text-text-dark/70">
                Received {formatDateTime(supply.received_at)}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-olive-light/30 bg-white">
            <CardContent className="space-y-2 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Supplier</p>
              <p className="text-sm font-medium text-text-dark">
                {supply.supplier_name || 'Not specified'}
              </p>
              <p className="text-xs text-text-dark/60">Reference</p>
              <p className="text-sm text-text-dark/80">{supply.reference || 'No PO reference'}</p>
            </CardContent>
          </Card>
          <Card className="border-olive-light/30 bg-white">
            <CardContent className="space-y-2 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Warehouse</p>
              <p className="text-sm font-medium text-text-dark">
                {supply.warehouse_name || 'Not assigned'}
              </p>
              <p className="text-xs text-text-dark/60">Pallets received</p>
              <p className="text-sm text-text-dark/80">{supply.pallets_received ?? '—'}</p>
            </CardContent>
          </Card>
          <Card className="border-olive-light/30 bg-white">
            <CardContent className="space-y-2 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Schedule</p>
              <p className="text-xs text-text-dark/60">Expected</p>
              <p className="text-sm font-medium text-text-dark">{formatDateTime(supply.expected_at)}</p>
              <p className="text-xs text-text-dark/60">Received</p>
              <p className="text-sm font-medium text-text-dark">{formatDateTime(supply.received_at)}</p>
            </CardContent>
          </Card>
          <Card className="border-olive-light/30 bg-white">
            <CardContent className="space-y-2 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Quantities</p>
              <p className="text-sm font-medium text-text-dark">
                Received {totalReceived.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg
              </p>
              <p className="text-xs text-text-dark/60">
                Accepted {totalAccepted.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg
              </p>
              <p className="text-xs text-text-dark/60">
                Rejected {totalRejected.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-olive-light/30 bg-white">
          <CardHeader>
            <CardTitle className="text-text-dark">Line items</CardTitle>
            <CardDescription>Quantities received versus accepted for each product.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveTable columns={lineColumns} data={lines} rowKey="id" />
          </CardContent>
        </Card>

        <Card className="border-olive-light/30 bg-white">
          <CardHeader>
            <CardTitle className="text-text-dark">Batches</CardTitle>
            <CardDescription>Traceability details for lots created during receiving.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveTable columns={batchColumns} data={batches} rowKey="id" />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-olive-light/30 bg-white">
            <CardHeader>
              <CardTitle className="text-text-dark">Quality checks</CardTitle>
              <CardDescription>Inspection results recorded during receiving.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {qualityEvaluationRows.length === 0 ? (
                <p className="text-sm text-text-dark/70">No quality checks recorded.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    {Number.isFinite(overallScoreValue) ? (
                      <span className="inline-flex items-center rounded-full bg-olive-light/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-dark/70">
                        Overall score: {overallScoreValue.toFixed(2)}
                      </span>
                    ) : null}
                    {primaryQualityCheck?.evaluated_at ? (
                      <span className="inline-flex items-center rounded-full bg-olive-light/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-dark/70">
                        Evaluated {formatDateTime(primaryQualityCheck.evaluated_at)}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center rounded-full bg-olive-light/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-dark/70">
                      Parameters reviewed: {qualityEvaluationRows.length}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-olive-light/40 bg-white">
                    <table className="min-w-full divide-y divide-olive-light/30">
                      <thead className="bg-olive-light/20">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Quality parameter
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Specification / Standard
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Score
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Remarks / Corrective actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-olive-light/30">
                        {qualityEvaluationRows.map((row) => (
                          <tr key={row.id} className="bg-white">
                            <td className="px-4 py-3 text-sm font-medium text-text-dark">{row.name}</td>
                            <td className="px-4 py-3 text-sm text-text-dark/80">{row.specification}</td>
                            <td className="px-4 py-3 text-sm text-text-dark/80">{row.score ?? '—'}</td>
                            <td className="px-4 py-3 text-sm text-text-dark/80">
                              {row.remarks?.trim() ? row.remarks.trim() : 'No remarks'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-olive-light/30 bg-white">
            <CardHeader>
              <CardTitle className="text-text-dark">Activity log</CardTitle>
              <CardDescription>Receiving milestones captured for this document.</CardDescription>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-sm text-text-dark/70">No activity recorded.</p>
              ) : (
                <ol className="space-y-3">
                  {activities.map((activity) => (
                    <li key={activity.id} className="rounded-lg border border-olive-light/40 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-text-dark">{activity.type}</p>
                        <span className="text-xs text-text-dark/60">
                          {formatDateTime(activity.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-text-dark/80">{activity.description}</p>
                      <p className="text-xs text-text-dark/60">By {activity.actor || 'Unknown'}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-olive-light/30 bg-white">
          <CardHeader>
            <CardTitle className="text-text-dark">Documents</CardTitle>
            <CardDescription>Supporting documentation attached to this receipt.</CardDescription>
            {documents.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {Object.entries(documentTypeCounts).map(([type, count]) => (
                  <span
                    key={type}
                    className="inline-flex items-center rounded-full bg-olive-light/30 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-dark/70"
                  >
                    {type}: {count}
                  </span>
                ))}
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Certificates total: {certificateCount}
                </span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-sm text-text-dark/70">No documents uploaded.</p>
            ) : (
              <ul className="space-y-3">
                {documents.map((document) => {
                  const isCertificate = document.type?.toLowerCase().includes('cert')
                  return (
                    <li
                      key={document.id}
                      className="flex flex-col gap-1 rounded-lg border border-olive-light/40 bg-olive-light/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium text-text-dark">{document.name}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-text-dark/60">
                          <span>{document.type || 'Uncategorised'}</span>
                          {isCertificate && (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                              Certificate
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-text-dark/60">
                        Uploaded {formatDateTime(document.uploaded_at)} by {document.uploaded_by}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}

export default SupplyDetail

