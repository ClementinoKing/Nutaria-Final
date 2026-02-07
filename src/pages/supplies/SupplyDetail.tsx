import { useMemo, useEffect, useState } from 'react'
import type React from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { SUPPLY_QUALITY_PARAMETERS, SupplyQualityParameter } from '@/constants/supplyQuality'
import { supabase } from '@/lib/supabaseClient'
import { Download, Loader2, Pencil } from 'lucide-react'

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

interface FetchedDetailData {
  supply: Record<string, unknown>
  supplyLines: Record<string, unknown>[]
  supplyBatches: Record<string, unknown>[]
  supplyQualityChecks: Record<string, unknown>[]
  supplyQualityItems: Record<string, unknown>[]
  supplyDocuments: Record<string, unknown>[]
  vehicleInspection: Record<string, unknown> | null
  packagingCheck: Record<string, unknown> | null
  packagingItems: Record<string, unknown>[]
  supplierSignOff: Record<string, unknown> | null
  supplierLookup: Record<string, unknown>
  warehouseLookup: Record<string, unknown>
  productLookup: Record<string, unknown>
  unitLookup: Record<string, unknown>
  profileLookup: Record<string, unknown>
  qualityParameters: QualityParameterWithId[]
}

function SupplyDetail() {
  const { supplyId: supplyIdParam } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const navigationState = location.state ?? {}
  const [fetchedData, setFetchedData] = useState<FetchedDetailData | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const supply = (navigationState.supply ?? fetchedData?.supply) ?? null
  const lines = Array.isArray(navigationState.supplyLines)
    ? navigationState.supplyLines
    : Array.isArray(fetchedData?.supplyLines)
      ? fetchedData!.supplyLines
      : []
  const batches = Array.isArray(navigationState.supplyBatches)
    ? navigationState.supplyBatches
    : Array.isArray(fetchedData?.supplyBatches)
      ? fetchedData!.supplyBatches
      : []
  const qualityChecks = Array.isArray(navigationState.supplyQualityChecks)
    ? navigationState.supplyQualityChecks
    : Array.isArray(fetchedData?.supplyQualityChecks)
      ? fetchedData!.supplyQualityChecks
      : []
  const qualityItems = Array.isArray(navigationState.supplyQualityItems)
    ? navigationState.supplyQualityItems
    : Array.isArray(fetchedData?.supplyQualityItems)
      ? fetchedData!.supplyQualityItems
      : []
  const qualityParameters =
    Array.isArray(navigationState.qualityParameters) && navigationState.qualityParameters.length > 0
      ? navigationState.qualityParameters
      : (fetchedData?.qualityParameters?.length
          ? fetchedData.qualityParameters
          : SUPPLY_QUALITY_PARAMETERS) as QualityParameterWithId[]
  const supplyDocuments = Array.isArray(navigationState.supplyDocuments)
    ? navigationState.supplyDocuments
    : Array.isArray(fetchedData?.supplyDocuments)
      ? fetchedData!.supplyDocuments
      : []
  const vehicleInspection = navigationState.vehicleInspection ?? fetchedData?.vehicleInspection ?? null
  const packagingCheck = navigationState.packagingCheck ?? fetchedData?.packagingCheck ?? null
  const packagingItems = Array.isArray(navigationState.packagingItems)
    ? navigationState.packagingItems
    : Array.isArray(fetchedData?.packagingItems)
      ? fetchedData!.packagingItems
      : []
  const supplierSignOff = navigationState.supplierSignOff ?? fetchedData?.supplierSignOff ?? null
  const [packagingParameters, setPackagingParameters] = useState<{ [key: number]: { code: string; name: string } }>({})
  const [documentTypes, setDocumentTypes] = useState<{ [key: string]: string }>({})
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)

  const supplyId = supplyIdParam ? parseInt(supplyIdParam, 10) : null
  const shouldFetch = !supply && supplyId != null && Number.isFinite(supplyId)

  useEffect(() => {
    if (!shouldFetch) return
    let cancelled = false
    setLoadingDetail(true)
    setDetailError(null)
    ;(async () => {
      try {
        const [
          { data: supplyRow, error: supplyErr },
          { data: linesData },
          { data: batchesData },
          { data: docsData },
          { data: vehicleData },
          { data: packagingChecksData },
          { data: packagingItemsData },
          { data: qualityChecksData },
          { data: qualityItemsData },
          { data: signOffData },
          { data: suppliersData },
          { data: warehousesData },
          { data: productsData },
          { data: unitsData },
          { data: profilesData },
          { data: qualityParamsData },
        ] = await Promise.all([
          supabase.from('supplies').select('*').eq('id', supplyId!).single(),
          supabase.from('supply_lines').select('*').eq('supply_id', supplyId!),
          supabase.from('supply_batches').select('*').eq('supply_id', supplyId!),
          supabase.from('supply_documents').select('*').eq('supply_id', supplyId!),
          supabase.from('supply_vehicle_inspections').select('*').eq('supply_id', supplyId!).maybeSingle(),
          supabase.from('supply_packaging_quality_checks').select('*').eq('supply_id', supplyId!),
          supabase.from('supply_packaging_quality_check_items').select('*'),
          supabase.from('supply_quality_checks').select('*').eq('supply_id', supplyId!),
          supabase.from('supply_quality_check_items').select('*'),
          supabase.from('supply_supplier_sign_offs').select('*').eq('supply_id', supplyId!).maybeSingle(),
          supabase.from('suppliers').select('id, name'),
          supabase.from('warehouses').select('id, name'),
          supabase.from('products').select('id, name, sku'),
          supabase.from('units').select('id, name, symbol'),
          supabase.from('user_profiles').select('id, full_name, email'),
          supabase.from('quality_parameters').select('id, code, name'),
        ])
        if (cancelled) return
        if (supplyErr || !supplyRow) {
          setDetailError('Supply not found')
          setLoadingDetail(false)
          return
        }
        const supplyObj = supplyRow as Record<string, unknown>
        const packagingCheckRow = (packagingChecksData as Record<string, unknown>[])?.[0] ?? null
        const packagingCheckId = packagingCheckRow ? (packagingCheckRow as { id: number }).id : null
        const packagingItemsFiltered = (packagingItemsData ?? []).filter(
          (i: { packaging_check_id?: number }) => i.packaging_check_id === packagingCheckId,
        ) as Record<string, unknown>[]
        const qualityChecksArr = (qualityChecksData ?? []) as { id: number }[]
        const qualityCheckIds = qualityChecksArr.map((c) => c.id)
        const qualityItemsFiltered = (qualityItemsData ?? []).filter((i: { quality_check_id?: number }) =>
          qualityCheckIds.includes(i.quality_check_id ?? 0),
        ) as Record<string, unknown>[]

        const supplierLookup: Record<string, unknown> = {}
        ;(suppliersData ?? []).forEach((s: { id: number; name?: string }) => {
          supplierLookup[String(s.id)] = s.name ?? ''
        })
        const warehouseLookup: Record<string, unknown> = {}
        ;(warehousesData ?? []).forEach((w: { id: number; name?: string }) => {
          warehouseLookup[String(w.id)] = w.name ?? ''
        })
        const productLookup: Record<string, unknown> = {}
        ;(productsData ?? []).forEach((p: { id: number; name?: string; sku?: string }) => {
          productLookup[String(p.id)] = { name: p.name ?? '', sku: p.sku ?? '' }
        })
        const unitLookup: Record<string, unknown> = {}
        ;(unitsData ?? []).forEach((u: { id: number; name?: string; symbol?: string }) => {
          unitLookup[String(u.id)] = { name: u.name ?? '', symbol: u.symbol ?? '' }
        })
        const profileLookup: Record<string, unknown> = {}
        ;(profilesData ?? []).forEach((p: { id: number; full_name?: string; email?: string }) => {
          profileLookup[String(p.id)] = { full_name: p.full_name ?? '', email: p.email ?? '' }
        })
        const qualityParams = ((qualityParamsData ?? []) as { id: number; code: string; name: string }[]).map(
          (q) => ({ id: q.id, code: q.code, name: q.name, specification: '', defaultRemarks: '' as string }),
        )

        setFetchedData({
          supply: supplyObj,
          supplyLines: (linesData ?? []) as Record<string, unknown>[],
          supplyBatches: (batchesData ?? []) as Record<string, unknown>[],
          supplyQualityChecks: (qualityChecksData ?? []) as Record<string, unknown>[],
          supplyQualityItems: qualityItemsFiltered,
          supplyDocuments: (docsData ?? []) as Record<string, unknown>[],
          vehicleInspection: vehicleData as Record<string, unknown> | null,
          packagingCheck: packagingCheckRow as Record<string, unknown> | null,
          packagingItems: packagingItemsFiltered,
          supplierSignOff: signOffData as Record<string, unknown> | null,
          supplierLookup,
          warehouseLookup,
          productLookup,
          unitLookup,
          profileLookup,
          qualityParameters: qualityParams,
        })
      } catch (e) {
        if (!cancelled) {
          setDetailError(e instanceof Error ? e.message : 'Failed to load supply')
        }
      } finally {
        if (!cancelled) setLoadingDetail(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [shouldFetch, supplyId])

  useEffect(() => {
    const fetchPackagingParameters = async () => {
      if (packagingItems.length === 0) return
      
      const paramIds = packagingItems
        .map((item: { [key: string]: unknown }) => item.parameter_id as number)
        .filter((id: number | undefined): id is number => id !== undefined && id !== null)
      
      if (paramIds.length === 0) return

      const { data, error } = await supabase
        .from('packaging_quality_parameters')
        .select('id, code, name')
        .in('id', paramIds)

      if (!error && data) {
        const paramMap: { [key: number]: { code: string; name: string } } = {}
        data.forEach((param) => {
          if (param.id) {
            paramMap[param.id] = { code: param.code, name: param.name }
          }
        })
        setPackagingParameters(paramMap)
      }
    }

    const fetchDocumentTypes = async () => {
      if (supplyDocuments.length === 0) return

      const { data, error } = await supabase
        .from('supply_document_types')
        .select('code, name')

      if (!error && data) {
        const typeMap: { [key: string]: string } = {}
        data.forEach((type) => {
          typeMap[type.code] = type.name
        })
        setDocumentTypes(typeMap)
      }
    }

    fetchPackagingParameters()
    fetchDocumentTypes()
  }, [packagingItems, supplyDocuments])

  const supplierLookup = useMemo(
    () => new Map(Object.entries(navigationState.supplierLookup ?? fetchedData?.supplierLookup ?? {})),
    [navigationState.supplierLookup, fetchedData?.supplierLookup],
  )
  const warehouseLookup = useMemo(
    () => new Map(Object.entries(navigationState.warehouseLookup ?? fetchedData?.warehouseLookup ?? {})),
    [navigationState.warehouseLookup, fetchedData?.warehouseLookup],
  )
  const productLookup = useMemo(
    () => new Map(Object.entries(navigationState.productLookup ?? fetchedData?.productLookup ?? {})),
    [navigationState.productLookup, fetchedData?.productLookup],
  )
  const unitLookup = useMemo(
    () => new Map(Object.entries(navigationState.unitLookup ?? fetchedData?.unitLookup ?? {})),
    [navigationState.unitLookup, fetchedData?.unitLookup],
  )
  const profileLookup = useMemo(
    () => new Map(Object.entries(navigationState.profileLookup ?? fetchedData?.profileLookup ?? {})),
    [navigationState.profileLookup, fetchedData?.profileLookup],
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
      // Treat null scores as N/A (value 4)
      if (scoreValue === null) {
        scoreValue = 4
      }

      const code =
        item.parameter_code ??
        (metadata && 'code' in metadata ? metadata.code : undefined)

      return {
        id: item.id ?? `${item.quality_check_id ?? 'check'}-${item.parameter_id ?? item.parameter_code}`,
        name: item.parameter_name ?? metadata?.name ?? 'Quality parameter',
        results: item.results ?? '',
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

  const handleEdit = () => {
    navigate(`/supplies/${supply.id}/edit`, {
      state: { backgroundLocation: location },
    })
  }

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true)

    try {
      const { default: jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 15
      let y = margin

      /* ================= COLORS ================= */
      const oliveDark: [number, number, number] = [34, 43, 28]
      const bgLight: [number, number, number] = [248, 249, 245]
      const textDark: [number, number, number] = [30, 30, 30]
      const textMuted: [number, number, number] = [107, 114, 128]

      const pageBreak = (space = 15) => {
        if (y + space > pageHeight - margin) {
          pdf.addPage()
          y = margin
        }
      }

      /* ================= BADGE ================= */
      const badge = (label: string, xPos: number, yPos: number, color: [number, number, number]) => {
        pdf.setFillColor(color[0], color[1], color[2])
        pdf.roundedRect(xPos, yPos - 4, pdf.getTextWidth(label) + 6, 7, 3, 3, 'F')
        pdf.setFontSize(8)
        pdf.setTextColor(255, 255, 255)
        pdf.text(label, xPos + 3, yPos + 1)
      }

      /* ================= SECTION HEADER ================= */
      const section = (num: number, title: string) => {
        pageBreak(20)
        pdf.setFillColor(oliveDark[0], oliveDark[1], oliveDark[2])
        pdf.roundedRect(margin, y, pageWidth - margin * 2, 8, 2, 2, 'F')

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.setTextColor(255, 255, 255)
        pdf.text(`${num}. ${title}`, margin + 4, y + 5)

        y += 14
      }

      /* ================= HEADER CARD ================= */
      pdf.setFillColor(bgLight[0], bgLight[1], bgLight[2])
      const headerHeight = 32
      pdf.roundedRect(margin, y, pageWidth - margin * 2, headerHeight, 4, 4, 'F')

      const headerPadding = 8
      const headerContentY = y + headerPadding
      const logoWidth = 22
      const logoHeight = 9
      const logoX = margin + headerPadding
      const logoY = headerContentY + (headerHeight - headerPadding * 2 - logoHeight) / 2

      // Logo on the left - smaller and vertically centered
      try {
        const res = await fetch('/img/logos/Nutaria_logo_alt.svg')
        const blob = await res.blob()
        const img = new Image()
        img.src = URL.createObjectURL(blob)

        await new Promise<void>((r) => {
          img.onload = () => {
            const c = document.createElement('canvas')
            c.width = img.width || 200
            c.height = img.height || 100
            const ctx = c.getContext('2d')
            if (ctx) {
              ctx.drawImage(img, 0, 0)
              pdf.addImage(c.toDataURL('image/png'), 'PNG', logoX, logoY, logoWidth, logoHeight)
            }
            URL.revokeObjectURL(img.src)
            r()
          }
          img.onerror = () => {
            URL.revokeObjectURL(img.src)
            r()
          }
        })
      } catch {}

      // Title in the center - properly spaced with clear boundaries
      const titleStartX = logoX + logoWidth + 15
      const rightColumnX = pageWidth - margin - headerPadding
      const rightColumnWidth = 65
      const titleWidth = rightColumnX - titleStartX - rightColumnWidth - 5
      
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(13)
      pdf.setTextColor(oliveDark[0], oliveDark[1], oliveDark[2])
      const titleText = 'SUPPLY RECEIVING & QUALITY RECORD'
      const titleLines = pdf.splitTextToSize(titleText, titleWidth)
      const titleY = headerContentY + (headerHeight - headerPadding * 2 - (titleLines.length * 4.5)) / 2 + 1
      pdf.text(titleLines, titleStartX, titleY)

      // Document info on the right - properly aligned and spaced, no overlap
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
      const docInfoStartY = headerContentY + 3
      pdf.text(`Doc: ${supply.doc_no}`, rightColumnX, docInfoStartY, { align: 'right' })
      pdf.text(`Received:`, rightColumnX, docInfoStartY + 7, { align: 'right' })
      pdf.setFontSize(7)
      pdf.text(formatDateTime(supply.received_at), rightColumnX, docInfoStartY + 12, { align: 'right' })

      y += headerHeight + 6

      // Status badges below header
      badge(supply.doc_status, margin, y, [76, 175, 80])
      badge(supply.quality_status || 'QUALITY PENDING', margin + 35, y, [255, 193, 7])
      y += 12

      let sectionNum = 1

      /* ================= SECTION 1 ================= */
      section(sectionNum++, 'Supply Overview')
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(textDark[0], textDark[1], textDark[2])

      const overview = [
        ['Supplier', supplierDisplayName ?? 'Not captured'],
        ['Warehouse', warehouseDisplayName ?? 'Not assigned'],
        ['Reference', supply.reference ?? 'Not recorded'],
        ['Transport Ref', supply.transport_reference ?? 'Not recorded'],
        ['Received By', receivedByDisplayName ?? 'Not recorded'],
        ['Pallets Received', supply.pallets_received?.toLocaleString() ?? '0'],
        ['Expected On Site', formatDateTime(supply.expected_at)],
        ['Created', formatDateTime(supply.created_at)],
      ]

      overview.forEach(([k, v]) => {
        pageBreak(6)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
        pdf.text(`${k}:`, margin, y)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(textDark[0], textDark[1], textDark[2])
        const valueLines = pdf.splitTextToSize(String(v), pageWidth - margin * 2 - 35)
        pdf.text(valueLines, margin + 35, y)
        y += valueLines.length * 5 + 1
      })

      /* ================= SECTION 2 ================= */
      if (supplyDocuments.length > 0) {
        section(sectionNum++, 'Supply Documents')
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(textDark[0], textDark[1], textDark[2])

        supplyDocuments.forEach((doc: { [key: string]: unknown }) => {
          pageBreak(8)
          const docType = String(doc.document_type_code ?? '')
          const label = documentTypes[docType] || docType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l: string) => l.toUpperCase())
          let value = 'Not recorded'

          if (doc.value) {
            value = String(doc.value)
          } else if (doc.date_value) {
            value = formatDate(doc.date_value as string | Date | number | null | undefined)
          } else if (doc.boolean_value !== null && doc.boolean_value !== undefined) {
            value = doc.boolean_value ? 'Yes' : 'No'
          } else if (doc.document_id) {
            value = 'Document uploaded'
          }

          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
          pdf.text(`${label}:`, margin, y)
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(textDark[0], textDark[1], textDark[2])
          const valueLines = pdf.splitTextToSize(String(value), pageWidth - margin * 2 - 35)
          pdf.text(valueLines, margin + 35, y)
          y += valueLines.length * 5 + 1
        })
      }

      /* ================= SECTION 3 ================= */
      if (vehicleInspection) {
        section(sectionNum++, 'Vehicle Inspection')
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(textDark[0], textDark[1], textDark[2])

        const inspection = [
          ['Vehicle Clean', vehicleInspection.vehicle_clean],
          ['No Foreign Objects', vehicleInspection.no_foreign_objects],
          ['No Pest Infestation', vehicleInspection.no_pest_infestation],
        ]

        inspection.forEach(([k, v]) => {
          pageBreak(6)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
          pdf.text(`${k}:`, margin, y)
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(textDark[0], textDark[1], textDark[2])
          pdf.text(String(v ?? 'Not recorded'), margin + 45, y)
          y += 6
        })

        if (vehicleInspection.remarks) {
          pageBreak(8)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
          pdf.text('Remarks:', margin, y)
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(textDark[0], textDark[1], textDark[2])
          const remarksLines = pdf.splitTextToSize(String(vehicleInspection.remarks), pageWidth - margin * 2 - 35)
          pdf.text(remarksLines, margin + 35, y)
          y += remarksLines.length * 5 + 1
        }
      }

      /* ================= SECTION 4 ================= */
      if (packagingCheck && packagingItems.length > 0) {
        section(sectionNum++, 'Packaging Quality Parameters')
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(textDark[0], textDark[1], textDark[2])

        packagingItems.forEach((item: { [key: string]: unknown }) => {
          pageBreak(8)
          const parameterId = item.parameter_id as number | undefined
          const param = parameterId ? packagingParameters[parameterId] : null
          const paramName = param?.name ?? 'Unknown Parameter'
          let displayValue = 'Not recorded'

          if (item.value) {
            displayValue = String(item.value)
          } else if (item.numeric_value !== null && item.numeric_value !== undefined) {
            displayValue = String(item.numeric_value)
          }

          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
          pdf.text(`${paramName}:`, margin, y)
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(textDark[0], textDark[1], textDark[2])
          const valueLines = pdf.splitTextToSize(displayValue, pageWidth - margin * 2 - 35)
          pdf.text(valueLines, margin + 35, y)
          y += valueLines.length * 5 + 1
        })
      }

      /* ================= SECTION 5 ================= */
      if (qualityEvaluationRows.length > 0) {
        section(sectionNum++, 'Quality Evaluation')
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(textDark[0], textDark[1], textDark[2])

        if (overallScoreValue !== null && Number.isFinite(overallScoreValue)) {
          pageBreak(8)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(oliveDark[0], oliveDark[1], oliveDark[2])
          pdf.text(`Overall Score: ${overallScoreValue.toFixed(2)}`, margin, y)
          y += 8
        }

        qualityEvaluationRows.forEach((row) => {
          pageBreak(12)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(oliveDark[0], oliveDark[1], oliveDark[2])
          pdf.text(row.name, margin, y)
          y += 5

          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(textDark[0], textDark[1], textDark[2])
          pdf.setFontSize(8)
          if (row.results) {
            pdf.text(`Results: ${row.results}`, margin + 5, y)
            y += 5
          }
          pdf.text(`Score: ${row.score === null || row.score === undefined || row.score === 4 ? 'N/A' : row.score}`, margin + 5, y)
          y += 5
          if (row.remarks?.trim()) {
            const remarksText = `Remarks: ${row.remarks.trim()}`
            const remarksLines = pdf.splitTextToSize(remarksText, pageWidth - margin * 2 - 10)
            pdf.text(remarksLines, margin + 5, y)
            y += remarksLines.length * 4
          }
          y += 3
        })
      }

      /* ================= SECTION 6 ================= */
      if (lines.length > 0) {
        section(sectionNum++, 'Line Items')
        pdf.setFontSize(8)

        lines.forEach((l: SupplyLineItem) => {
          pageBreak(18)
          const name = getProductMeta(l.product_id)?.name?.trim() ?? l.product_name ?? 'Product'
          const sku = getProductMeta(l.product_id)?.sku?.trim() ?? l.product_sku ?? 'No SKU'

          pdf.setFont('helvetica', 'bold')
          pdf.text(name, margin, y)
          y += 4

          pdf.setFont('helvetica', 'normal')
          pdf.text(`SKU: ${sku}`, margin + 4, y)
          y += 4
          pdf.text(`Ordered: ${formatQuantityWithUnit(l.ordered_qty ?? l.qty ?? 0, l.unit_id)}`, margin + 4, y)
          y += 4
          pdf.text(`Received: ${formatQuantityWithUnit(l.received_qty ?? 0, l.unit_id)}`, margin + 4, y)
          y += 4
          pdf.text(`Accepted: ${formatQuantityWithUnit(l.accepted_qty ?? 0, l.unit_id)}`, margin + 4, y)
          if (l.variance_reason) {
            y += 4
            pdf.text(`Variance: ${l.variance_reason}`, margin + 4, y)
          }
          y += 6
        })
      }

      /* ================= SECTION 7 ================= */
      if (batches.length > 0) {
        section(sectionNum++, 'Batches')
        pdf.setFontSize(8)
        pdf.setTextColor(textDark[0], textDark[1], textDark[2])

        batches.forEach((batch: SupplyBatchItem) => {
          pageBreak(12)
          pdf.setFont('helvetica', 'bold')
          pdf.text(`Lot: ${batch.lot_no ?? 'N/A'}`, margin, y)
          y += 4
          pdf.setFont('helvetica', 'normal')
          const productName = getProductMeta(batch.product_id)?.name?.trim() ?? batch.product_name ?? 'Product'
          pdf.text(`Product: ${productName}`, margin + 5, y)
          y += 4
          pdf.text(`Received: ${formatQuantityWithUnit(batch.received_qty ?? 0, batch.unit_id)}`, margin + 5, y)
          y += 4
          pdf.text(`Accepted: ${formatQuantityWithUnit(batch.accepted_qty ?? 0, batch.unit_id)}`, margin + 5, y)
          y += 4
          pdf.text(`Quality Status: ${batch.quality_status ?? 'PENDING'}`, margin + 5, y)
          y += 5
        })
      }

      /* ================= SECTION 8 ================= */
      section(sectionNum++, 'Acceptance Decision')
      pdf.rect(margin, y, pageWidth - margin * 2, 22)
      pdf.text('☐ Accepted   ☐ Accepted with Deviation   ☐ Rejected   ☐ Quality Hold', margin + 4, y + 8)
      y += 28

      /* ================= SECTION 9 ================= */
      section(sectionNum++, 'Supplier Sign-Off')
      if (supplierSignOff) {
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(textDark[0], textDark[1], textDark[2])

        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
        pdf.text('Signed By:', margin, y)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(textDark[0], textDark[1], textDark[2])
        pdf.text(String(supplierSignOff.signed_by_name ?? 'Not recorded'), margin + 40, y)
        y += 8

        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
        pdf.text('Signature Type:', margin, y)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(textDark[0], textDark[1], textDark[2])
        pdf.text(supplierSignOff.signature_type === 'E_SIGNATURE' ? 'E-Signature' : 'Uploaded Document', margin + 40, y)
        y += 8

        if (supplierSignOff.signed_at) {
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
          pdf.text('Signed At:', margin, y)
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(textDark[0], textDark[1], textDark[2])
          pdf.text(formatDateTime(supplierSignOff.signed_at), margin + 40, y)
          y += 8
        }

        // Render signature image if it's an e-signature
        if (supplierSignOff.signature_type === 'E_SIGNATURE' && supplierSignOff.signature_data) {
          pageBreak(35)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
          pdf.text('Signature:', margin, y)
          y += 6
          
          try {
            const signatureData = String(supplierSignOff.signature_data)
            // jsPDF can handle data URLs directly, but let's ensure it's in the right format
            let imageData = signatureData
            
            // If it's not already a data URL, prepend the data URL prefix
            if (!signatureData.startsWith('data:')) {
              imageData = `data:image/png;base64,${signatureData}`
            }
            
            // Add image to PDF (max width 80mm, height 30mm)
            const imgWidth = 80
            const imgHeight = 30
            pdf.addImage(imageData, 'PNG', margin, y, imgWidth, imgHeight)
            y += imgHeight + 5
          } catch (error) {
            console.warn('Could not add signature image to PDF:', error)
            pdf.setFont('helvetica', 'normal')
            pdf.setTextColor(textDark[0], textDark[1], textDark[2])
            pdf.text('Signature image available but could not be rendered', margin, y)
            y += 6
          }
        } else if (supplierSignOff.signature_type === 'UPLOADED_DOCUMENT' && supplierSignOff.document_id) {
          pageBreak(8)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
          pdf.text('Signature:', margin, y)
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(textDark[0], textDark[1], textDark[2])
          pdf.text('Signature document uploaded (see attached)', margin + 40, y)
          y += 8
        }

        if (supplierSignOff.remarks) {
          pageBreak(10)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
          pdf.text('Remarks:', margin, y)
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(textDark[0], textDark[1], textDark[2])
          const remarksLines = pdf.splitTextToSize(String(supplierSignOff.remarks), pageWidth - margin * 2 - 40)
          pdf.text(remarksLines, margin + 40, y)
          y += remarksLines.length * 5 + 2
        }
      } else {
        pdf.text('Supplier Name:', margin, y)
        pdf.line(margin + 40, y + 1, margin + 120, y + 1)
        y += 8
        pdf.text('Signature:', margin, y)
        pdf.line(margin + 40, y + 1, margin + 120, y + 1)
        y += 8
        pdf.text('Date:', margin, y)
        pdf.line(margin + 40, y + 1, margin + 80, y + 1)
      }

      /* ================= FOOTER ================= */
      const pages = pdf.getNumberOfPages()
      for (let i = 1; i <= pages; i++) {
        pdf.setPage(i)
        pdf.setFontSize(8)
        pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2])
        pdf.text(`Generated by Nutaria Supply & Quality System`, margin, pageHeight - 8)
        pdf.text(`Page ${i} of ${pages}`, pageWidth / 2, pageHeight - 8, { align: 'center' })
      }

      pdf.save(`Supply_${supply.doc_no}.pdf`)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Failed to generate PDF. Please try again.')
    } finally {
      setIsGeneratingPDF(false)
    }
  }

  if (loadingDetail) {
    return (
      <PageLayout title="Supply Detail" activeItem="supplies" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-olive" />
        </div>
      </PageLayout>
    )
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
              {detailError ?? 'The supply document you are trying to access could not be located.'}
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
        <>
          <Button variant="outline" onClick={handleEdit} className="gap-2">
            <Pencil className="h-4 w-4" />
            Edit supply
          </Button>
          <Button 
            variant="outline" 
            onClick={handleDownloadPDF} 
            className="gap-2"
            disabled={isGeneratingPDF}
          >
            {isGeneratingPDF ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download PDF
              </>
            )}
          </Button>
          <Button variant="outline" onClick={handleBack}>
            Back to Supplies
          </Button>
        </>
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
                            {row.results ? (
                              <p className="text-xs text-text-dark/60">{row.results}</p>
                            ) : null}
                          </div>
                          <span className="text-sm font-semibold text-text-dark">
                            {row.score === null || row.score === undefined || row.score === 4 ? 'N/A' : Number.isFinite(row.score) ? row.score : 'Pending'}
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

        {supplyDocuments.length > 0 && (
          <Card className="border-olive-light/30 bg-white">
            <CardHeader>
              <CardTitle className="text-text-dark">Supply Documents</CardTitle>
              <CardDescription>Document information and uploaded files for this supply.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {supplyDocuments.map((doc: { [key: string]: unknown }) => {
                  const docType = String(doc.document_type_code ?? '')
                  const label = documentTypes[docType] || docType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())
                  let value: string | React.ReactNode = 'Not recorded'

                  if (doc.value) {
                    value = String(doc.value)
                  } else if (doc.date_value) {
                    const dateVal = doc.date_value as string | Date | number | null | undefined
                    value = formatDate(dateVal)
                  } else if (doc.boolean_value !== null && doc.boolean_value !== undefined) {
                    value = doc.boolean_value ? 'Yes' : 'No'
                  } else if (doc.document_id) {
                    value = (
                      <span className="inline-flex items-center gap-1 text-olive-dark">
                        <span>Document uploaded</span>
                      </span>
                    )
                  }

                  return (
                    <div key={`${doc.supply_id}-${doc.document_type_code}`} className="space-y-1">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                        {label}
                      </dt>
                      <dd className="text-sm font-medium text-text-dark">{value}</dd>
                    </div>
                  )
                })}
              </dl>
            </CardContent>
          </Card>
        )}

        {vehicleInspection && (
          <Card className="border-olive-light/30 bg-white">
            <CardHeader>
              <CardTitle className="text-text-dark">Vehicle Inspections</CardTitle>
              <CardDescription>Vehicle inspection checklist completed during receiving.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      Vehicle Clean
                    </dt>
                    <dd className="text-sm font-medium text-text-dark">
                      {String(vehicleInspection.vehicle_clean ?? 'Not recorded')}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      No Foreign Objects
                    </dt>
                    <dd className="text-sm font-medium text-text-dark">
                      {String(vehicleInspection.no_foreign_objects ?? 'Not recorded')}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      No Pest Infestation
                    </dt>
                    <dd className="text-sm font-medium text-text-dark">
                      {String(vehicleInspection.no_pest_infestation ?? 'Not recorded')}
                    </dd>
                  </div>
                  {vehicleInspection.inspected_at && (
                    <div className="space-y-1">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                        Inspected At
                      </dt>
                      <dd className="text-sm font-medium text-text-dark">
                        {formatDateTime(vehicleInspection.inspected_at)}
                      </dd>
                    </div>
                  )}
                </div>
                {vehicleInspection.remarks && (
                  <div className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      Remarks
                    </dt>
                    <dd className="text-sm text-text-dark/70">{String(vehicleInspection.remarks)}</dd>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {packagingCheck && packagingItems.length > 0 && (
          <Card className="border-olive-light/30 bg-white">
            <CardHeader>
              <CardTitle className="text-text-dark">Packaging Quality Parameters</CardTitle>
              <CardDescription>Packaging quality evaluation results.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {packagingCheck.checked_at && (
                  <div className="text-xs font-semibold uppercase tracking-wide text-text-dark/70">
                    Checked {formatDateTime(packagingCheck.checked_at)}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {packagingItems.map((item: { [key: string]: unknown }) => {
                    const parameterId = item.parameter_id as number | undefined
                    const param = parameterId ? packagingParameters[parameterId] : null
                    const paramName = param?.name ?? 'Unknown Parameter'
                    let displayValue = 'Not recorded'

                    if (item.value) {
                      displayValue = String(item.value)
                    } else if (item.numeric_value !== null && item.numeric_value !== undefined) {
                      displayValue = String(item.numeric_value)
                    }

                    return (
                      <div
                        key={`packaging-${item.id}`}
                        className="flex flex-col justify-between rounded-xl border border-olive-light/40 bg-white px-4 py-3"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-text-dark">{paramName}</p>
                          <p className="text-sm font-semibold text-text-dark">{displayValue}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {packagingCheck.remarks && (
                  <div className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      Remarks
                    </dt>
                    <dd className="text-sm text-text-dark/70">{String(packagingCheck.remarks)}</dd>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {supplierSignOff && (
          <Card className="border-olive-light/30 bg-white">
            <CardHeader>
              <CardTitle className="text-text-dark">Supplier Sign-Off</CardTitle>
              <CardDescription>Supplier acknowledgment and signature.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      Signed By
                    </dt>
                    <dd className="text-sm font-medium text-text-dark">
                      {String(supplierSignOff.signed_by_name ?? 'Not recorded')}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      Signature Type
                    </dt>
                    <dd className="text-sm font-medium text-text-dark">
                      {supplierSignOff.signature_type === 'E_SIGNATURE' ? 'E-Signature' : 'Uploaded Document'}
                    </dd>
                  </div>
                  {supplierSignOff.signed_at && (
                    <div className="space-y-1">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                        Signed At
                      </dt>
                      <dd className="text-sm font-medium text-text-dark">
                        {formatDateTime(supplierSignOff.signed_at)}
                      </dd>
                    </div>
                  )}
                </div>
                {supplierSignOff.signature_type === 'E_SIGNATURE' && supplierSignOff.signature_data && (
                  <div className="space-y-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      Signature
                    </dt>
                    <dd>
                      <img
                        src={String(supplierSignOff.signature_data)}
                        alt="Supplier signature"
                        className="max-w-xs rounded-lg border border-olive-light/40"
                      />
                    </dd>
                  </div>
                )}
                {supplierSignOff.remarks && (
                  <div className="space-y-1">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      Remarks
                    </dt>
                    <dd className="text-sm text-text-dark/70">{String(supplierSignOff.remarks)}</dd>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  )
}

export default SupplyDetail
