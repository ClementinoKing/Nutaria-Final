import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, RefreshCcw, X, Pencil, Trash2 } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import {
  usePackagingSettings,
  type BoxPackRule,
  type BoxPackRuleInput,
  type PackagingType,
  type PackagingUnit,
  type PackagingUnitInput,
  type UnitType,
} from '@/hooks/usePackagingSettings'

interface UnitFormData {
  code: string
  name: string
  unit_type: UnitType
  packaging_type: PackagingType | ''
  net_weight_kg: string
  length_mm: string
  width_mm: string
  height_mm: string
}

interface RuleFormData {
  box_unit_id: string
  packet_unit_id: string
  packets_per_box: string
}

interface UnitFormErrors {
  code?: string
  name?: string
  packaging_type?: string
  net_weight_kg?: string
}

interface RuleFormErrors {
  box_unit_id?: string
  packet_unit_id?: string
  packets_per_box?: string
}

const defaultUnitForm: UnitFormData = {
  code: '',
  name: '',
  unit_type: 'PACKET',
  packaging_type: '',
  net_weight_kg: '',
  length_mm: '',
  width_mm: '',
  height_mm: '',
}

const defaultRuleForm: RuleFormData = {
  box_unit_id: '',
  packet_unit_id: '',
  packets_per_box: '',
}

function parseNumericInput(value: string, integerOnly = false): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = integerOnly ? Number.parseInt(trimmed, 10) : Number.parseFloat(trimmed)
  if (Number.isNaN(parsed)) return null
  return parsed
}

function formatKg(value: number | null): string {
  if (value === null) return '—'
  return `${value.toFixed(3)} kg`
}

function formatDimensions(unit: PackagingUnit): string {
  const { length_mm, width_mm, height_mm } = unit
  if (length_mm === null || width_mm === null || height_mm === null) return '—'
  return `${length_mm} × ${width_mm} × ${height_mm} mm`
}

function PackagingManagement() {
  const {
    packagingUnits,
    boxPackRules,
    loading,
    error,
    refresh,
    createUnit,
    updateUnit,
    toggleUnitActive,
    createRule,
    updateRule,
    toggleRuleActive,
    deleteRule,
  } = usePackagingSettings()

  const [searchTerm, setSearchTerm] = useState('')
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false)
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [unitForm, setUnitForm] = useState<UnitFormData>(defaultUnitForm)
  const [ruleForm, setRuleForm] = useState<RuleFormData>(defaultRuleForm)
  const [unitFormErrors, setUnitFormErrors] = useState<UnitFormErrors>({})
  const [ruleFormErrors, setRuleFormErrors] = useState<RuleFormErrors>({})

  const [editingUnit, setEditingUnit] = useState<PackagingUnit | null>(null)
  const [editingRule, setEditingRule] = useState<BoxPackRule | null>(null)

  const filteredUnits = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return packagingUnits
    return packagingUnits.filter((item) => {
      const code = item.code.toLowerCase()
      const name = item.name.toLowerCase()
      const unitType = item.unit_type.toLowerCase()
      const packType = (item.packaging_type ?? '').toLowerCase()
      return code.includes(term) || name.includes(term) || unitType.includes(term) || packType.includes(term)
    })
  }, [packagingUnits, searchTerm])

  const boxOptions = useMemo(
    () => packagingUnits.filter((item) => item.unit_type === 'BOX'),
    [packagingUnits]
  )
  const packetOptions = useMemo(
    () => packagingUnits.filter((item) => item.unit_type === 'PACKET'),
    [packagingUnits]
  )

  const unitStats = useMemo(() => {
    const total = packagingUnits.length
    const active = packagingUnits.filter((u) => u.is_active).length
    const packetCount = packagingUnits.filter((u) => u.unit_type === 'PACKET').length
    const boxCount = packagingUnits.filter((u) => u.unit_type === 'BOX').length
    return { total, active, packetCount, boxCount }
  }, [packagingUnits])

  const handleOpenCreateUnit = () => {
    setEditingUnit(null)
    setUnitForm(defaultUnitForm)
    setUnitFormErrors({})
    setIsUnitModalOpen(true)
  }

  const handleOpenEditUnit = (unit: PackagingUnit) => {
    setEditingUnit(unit)
    setUnitForm({
      code: unit.code,
      name: unit.name,
      unit_type: unit.unit_type,
      packaging_type: unit.packaging_type ?? '',
      net_weight_kg: unit.net_weight_kg === null ? '' : String(unit.net_weight_kg),
      length_mm: unit.length_mm === null ? '' : String(unit.length_mm),
      width_mm: unit.width_mm === null ? '' : String(unit.width_mm),
      height_mm: unit.height_mm === null ? '' : String(unit.height_mm),
    })
    setUnitFormErrors({})
    setIsUnitModalOpen(true)
  }

  const handleOpenCreateRule = () => {
    setEditingRule(null)
    setRuleForm(defaultRuleForm)
    setRuleFormErrors({})
    setIsRuleModalOpen(true)
  }

  const handleOpenEditRule = (rule: BoxPackRule) => {
    setEditingRule(rule)
    setRuleForm({
      box_unit_id: String(rule.box_unit_id),
      packet_unit_id: String(rule.packet_unit_id),
      packets_per_box: String(rule.packets_per_box),
    })
    setRuleFormErrors({})
    setIsRuleModalOpen(true)
  }

  const handleUnitFieldChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setUnitForm((previous) => {
      if (name === 'unit_type') {
        const nextType = value as UnitType
        return {
          ...previous,
          unit_type: nextType,
          packaging_type: nextType === 'BOX' ? 'BOX' : previous.packaging_type === 'BOX' ? '' : previous.packaging_type,
          net_weight_kg: nextType === 'BOX' ? '' : previous.net_weight_kg,
        }
      }
      return { ...previous, [name]: value }
    })
  }

  const handleRuleFieldChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setRuleForm((previous) => ({ ...previous, [name]: value }))
  }

  const validateUnitForm = (): boolean => {
    const nextErrors: UnitFormErrors = {}
    if (!unitForm.code.trim()) nextErrors.code = 'Code is required.'
    if (!unitForm.name.trim()) nextErrors.name = 'Name is required.'

    if (unitForm.unit_type === 'PACKET') {
      if (!unitForm.packaging_type || unitForm.packaging_type === 'BOX') {
        nextErrors.packaging_type = 'Select a packet packaging type.'
      }
      const netWeight = parseNumericInput(unitForm.net_weight_kg)
      if (netWeight === null || netWeight <= 0) {
        nextErrors.net_weight_kg = 'Net weight must be greater than 0.'
      }
    }

    setUnitFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const validateRuleForm = (): boolean => {
    const nextErrors: RuleFormErrors = {}
    if (!ruleForm.box_unit_id) nextErrors.box_unit_id = 'Box unit is required.'
    if (!ruleForm.packet_unit_id) nextErrors.packet_unit_id = 'Packet unit is required.'

    const packetsPerBox = parseNumericInput(ruleForm.packets_per_box, true)
    if (packetsPerBox === null || packetsPerBox <= 0) {
      nextErrors.packets_per_box = 'Packets per box must be a positive integer.'
    }

    setRuleFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const mapUnitFormToPayload = (): PackagingUnitInput => {
    const isBox = unitForm.unit_type === 'BOX'
    return {
      code: unitForm.code.trim(),
      name: unitForm.name.trim(),
      unit_type: unitForm.unit_type,
      packaging_type: isBox ? 'BOX' : ((unitForm.packaging_type || null) as PackagingType | null),
      net_weight_kg: isBox ? null : parseNumericInput(unitForm.net_weight_kg),
      length_mm: parseNumericInput(unitForm.length_mm, true),
      width_mm: parseNumericInput(unitForm.width_mm, true),
      height_mm: parseNumericInput(unitForm.height_mm, true),
    }
  }

  const mapRuleFormToPayload = (): BoxPackRuleInput => ({
    box_unit_id: Number.parseInt(ruleForm.box_unit_id, 10),
    packet_unit_id: Number.parseInt(ruleForm.packet_unit_id, 10),
    packets_per_box: Number.parseInt(ruleForm.packets_per_box, 10),
  })

  const handleSubmitUnit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validateUnitForm()) return

    setIsSubmitting(true)
    try {
      const payload = mapUnitFormToPayload()
      const result = editingUnit
        ? await updateUnit(editingUnit.id, payload)
        : await createUnit(payload)

      if (result.error) {
        if (result.error.code === '23505') {
          toast.error('A packaging unit with this code already exists.')
          return
        }
        throw result.error
      }

      toast.success(editingUnit ? 'Packaging unit updated.' : 'Packaging unit created.')
      setIsUnitModalOpen(false)
      setEditingUnit(null)
      setUnitForm(defaultUnitForm)
    } catch (submitError) {
      console.error('Error saving packaging unit', submitError)
      toast.error(submitError instanceof Error ? submitError.message : 'Unable to save packaging unit.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validateRuleForm()) return

    setIsSubmitting(true)
    try {
      const payload = mapRuleFormToPayload()
      const result = editingRule
        ? await updateRule(editingRule.id, payload)
        : await createRule(payload)

      if (result.error) {
        if (result.error.code === '23505') {
          toast.error('This box and packet combination already exists.')
          return
        }
        throw result.error
      }

      toast.success(editingRule ? 'Rule updated.' : 'Rule created.')
      setIsRuleModalOpen(false)
      setEditingRule(null)
      setRuleForm(defaultRuleForm)
    } catch (submitError) {
      console.error('Error saving box pack rule', submitError)
      toast.error(submitError instanceof Error ? submitError.message : 'Unable to save rule.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleUnit = async (unit: PackagingUnit) => {
    const result = await toggleUnitActive(unit.id, !unit.is_active)
    if (result.error) {
      toast.error(result.error.message ?? 'Unable to update unit status.')
      return
    }
    toast.success(`Unit ${unit.is_active ? 'deactivated' : 'activated'}.`)
  }

  const handleToggleRule = async (rule: BoxPackRule) => {
    const result = await toggleRuleActive(rule.id, !rule.is_active)
    if (result.error) {
      toast.error(result.error.message ?? 'Unable to update rule status.')
      return
    }
    toast.success(`Rule ${rule.is_active ? 'deactivated' : 'activated'}.`)
  }

  const handleDeleteRule = async (rule: BoxPackRule) => {
    const shouldDelete = window.confirm('Delete this box pack rule?')
    if (!shouldDelete) return

    const result = await deleteRule(rule.id)
    if (result.error) {
      toast.error(result.error.message ?? 'Unable to delete rule.')
      return
    }
    toast.success('Rule deleted.')
  }

  const unitColumns = [
      {
        key: 'code',
        header: 'Code',
        render: (row: PackagingUnit) => <div className="font-medium text-text-dark">{row.code}</div>,
        mobileRender: (row: PackagingUnit) => <div className="text-right font-medium text-text-dark">{row.code}</div>,
      },
      {
        key: 'name',
        header: 'Name',
        render: (row: PackagingUnit) => <div className="text-text-dark/80">{row.name}</div>,
        mobileRender: (row: PackagingUnit) => <div className="text-right text-text-dark/80">{row.name}</div>,
      },
      {
        key: 'type',
        header: 'Type',
        render: (row: PackagingUnit) => (
          <div className="text-text-dark/80">
            {row.unit_type} · {row.packaging_type ?? '—'}
          </div>
        ),
        mobileRender: (row: PackagingUnit) => (
          <div className="text-right text-text-dark/80">
            {row.unit_type} · {row.packaging_type ?? '—'}
          </div>
        ),
      },
      {
        key: 'weight',
        header: 'Net Weight',
        render: (row: PackagingUnit) => <div className="text-text-dark/70">{formatKg(row.net_weight_kg)}</div>,
        mobileRender: (row: PackagingUnit) => <div className="text-right text-text-dark/70">{formatKg(row.net_weight_kg)}</div>,
      },
      {
        key: 'dims',
        header: 'Dimensions',
        render: (row: PackagingUnit) => <div className="text-text-dark/70">{formatDimensions(row)}</div>,
        mobileRender: (row: PackagingUnit) => <div className="text-right text-text-dark/70">{formatDimensions(row)}</div>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (row: PackagingUnit) => (
          <span
            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
              row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {row.is_active ? 'Active' : 'Inactive'}
          </span>
        ),
        mobileRender: (row: PackagingUnit) => (
          <span
            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
              row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {row.is_active ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (row: PackagingUnit) => (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-blue-600 hover:bg-blue-50" onClick={() => handleOpenEditUnit(row)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleToggleUnit(row)}>
              {row.is_active ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        ),
        mobileRender: (row: PackagingUnit) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" className="text-blue-600 hover:bg-blue-50" onClick={() => handleOpenEditUnit(row)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleToggleUnit(row)}>
              {row.is_active ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        ),
      },
    ]

  const ruleColumns = [
      {
        key: 'box',
        header: 'Box Unit',
        render: (row: BoxPackRule) => <div className="text-text-dark">{row.box_unit?.code ?? row.box_unit_id}</div>,
        mobileRender: (row: BoxPackRule) => <div className="text-right text-text-dark">{row.box_unit?.code ?? row.box_unit_id}</div>,
      },
      {
        key: 'packet',
        header: 'Packet Unit',
        render: (row: BoxPackRule) => <div className="text-text-dark">{row.packet_unit?.code ?? row.packet_unit_id}</div>,
        mobileRender: (row: BoxPackRule) => <div className="text-right text-text-dark">{row.packet_unit?.code ?? row.packet_unit_id}</div>,
      },
      {
        key: 'qty',
        header: 'Packets/Box',
        render: (row: BoxPackRule) => <div className="text-text-dark/80">{row.packets_per_box}</div>,
        mobileRender: (row: BoxPackRule) => <div className="text-right text-text-dark/80">{row.packets_per_box}</div>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (row: BoxPackRule) => (
          <span
            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
              row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {row.is_active ? 'Active' : 'Inactive'}
          </span>
        ),
        mobileRender: (row: BoxPackRule) => (
          <span
            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
              row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {row.is_active ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (row: BoxPackRule) => (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-blue-600 hover:bg-blue-50" onClick={() => handleOpenEditRule(row)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleToggleRule(row)}>
              {row.is_active ? 'Deactivate' : 'Activate'}
            </Button>
            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => handleDeleteRule(row)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        mobileRender: (row: BoxPackRule) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" className="text-blue-600 hover:bg-blue-50" onClick={() => handleOpenEditRule(row)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleToggleRule(row)}>
              {row.is_active ? 'Deactivate' : 'Activate'}
            </Button>
            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => handleDeleteRule(row)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ]

  if (loading && packagingUnits.length === 0) {
    return (
      <PageLayout title="Packaging" activeItem="settings" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading packaging settings..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Packaging"
      activeItem="settings"
      actions={
        <>
          <Button type="button" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenCreateUnit}>
            <Plus className="mr-2 h-4 w-4" />
            Add Unit
          </Button>
        </>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total units</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{unitStats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Active units</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{unitStats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Packet units</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{unitStats.packetCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Box units</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{unitStats.boxCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-olive-light/30 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">Packaging Units</CardTitle>
          <CardDescription>Manage packet and box definitions used in packaging.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="pkg-search">Search</Label>
              <Input
                id="pkg-search"
                className="mt-1"
                placeholder="Search by code, name, unit type, or packaging type"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.message ?? 'Unable to load packaging settings from Supabase.'}
            </div>
          ) : null}

          <ResponsiveTable
            columns={unitColumns}
            data={filteredUnits}
            rowKey="id"
            emptyMessage={loading ? 'Loading packaging units…' : 'No packaging units found.'}
            tableClassName={undefined}
            mobileCardClassName={undefined}
            getRowClassName={undefined}
            onRowClick={undefined}
          />
        </CardContent>
      </Card>

      <Card className="mt-6 border-olive-light/30 bg-white">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-text-dark">Box Pack Rules</CardTitle>
            <CardDescription>Define how many packets fit into each box.</CardDescription>
          </div>
          <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenCreateRule}>
            <Plus className="mr-2 h-4 w-4" />
            Add Rule
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={ruleColumns}
            data={boxPackRules}
            rowKey="id"
            emptyMessage={loading ? 'Loading box pack rules…' : 'No rules found.'}
            tableClassName={undefined}
            mobileCardClassName={undefined}
            getRowClassName={undefined}
            onRowClick={undefined}
          />
        </CardContent>
      </Card>

      {isUnitModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-text-dark">
                  {editingUnit ? 'Edit Packaging Unit' : 'Add Packaging Unit'}
                </h2>
                <p className="text-sm text-text-dark/70">Configure packet or box dimensions and weight details.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsUnitModalOpen(false)}
                disabled={isSubmitting}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <form className="space-y-4 px-6 py-6" onSubmit={handleSubmitUnit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="pu-code">Code</Label>
                  <Input
                    id="pu-code"
                    name="code"
                    value={unitForm.code}
                    onChange={handleUnitFieldChange}
                    placeholder="e.g. VAC_10KG"
                    className="mt-1"
                    disabled={isSubmitting}
                  />
                  {unitFormErrors.code ? <p className="mt-1 text-sm text-red-600">{unitFormErrors.code}</p> : null}
                </div>
                <div>
                  <Label htmlFor="pu-name">Name</Label>
                  <Input
                    id="pu-name"
                    name="name"
                    value={unitForm.name}
                    onChange={handleUnitFieldChange}
                    placeholder="e.g. Vacuum Silver Bag 10kg"
                    className="mt-1"
                    disabled={isSubmitting}
                  />
                  {unitFormErrors.name ? <p className="mt-1 text-sm text-red-600">{unitFormErrors.name}</p> : null}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="pu-unit-type">Unit Type</Label>
                  <select
                    id="pu-unit-type"
                    name="unit_type"
                    value={unitForm.unit_type}
                    onChange={handleUnitFieldChange}
                    className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                    disabled={isSubmitting}
                  >
                    <option value="PACKET">PACKET</option>
                    <option value="BOX">BOX</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="pu-packaging-type">Packaging Type</Label>
                  <select
                    id="pu-packaging-type"
                    name="packaging_type"
                    value={unitForm.unit_type === 'BOX' ? 'BOX' : unitForm.packaging_type}
                    onChange={handleUnitFieldChange}
                    className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive disabled:bg-gray-100"
                    disabled={isSubmitting || unitForm.unit_type === 'BOX'}
                  >
                    <option value="">Select packaging type</option>
                    <option value="DOY">DOY</option>
                    <option value="VACUUM">VACUUM</option>
                    <option value="POLY">POLY</option>
                    <option value="BOX">BOX</option>
                  </select>
                  {unitFormErrors.packaging_type ? (
                    <p className="mt-1 text-sm text-red-600">{unitFormErrors.packaging_type}</p>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor="pu-net-weight">Net Weight (kg)</Label>
                  <Input
                    id="pu-net-weight"
                    name="net_weight_kg"
                    type="number"
                    step="0.001"
                    min="0"
                    value={unitForm.net_weight_kg}
                    onChange={handleUnitFieldChange}
                    className="mt-1"
                    disabled={isSubmitting || unitForm.unit_type === 'BOX'}
                  />
                  {unitFormErrors.net_weight_kg ? (
                    <p className="mt-1 text-sm text-red-600">{unitFormErrors.net_weight_kg}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="pu-length">Length (mm)</Label>
                  <Input
                    id="pu-length"
                    name="length_mm"
                    type="number"
                    min="0"
                    value={unitForm.length_mm}
                    onChange={handleUnitFieldChange}
                    className="mt-1"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <Label htmlFor="pu-width">Width (mm)</Label>
                  <Input
                    id="pu-width"
                    name="width_mm"
                    type="number"
                    min="0"
                    value={unitForm.width_mm}
                    onChange={handleUnitFieldChange}
                    className="mt-1"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <Label htmlFor="pu-height">Height (mm)</Label>
                  <Input
                    id="pu-height"
                    name="height_mm"
                    type="number"
                    min="0"
                    value={unitForm.height_mm}
                    onChange={handleUnitFieldChange}
                    className="mt-1"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-olive-light/20 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsUnitModalOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-olive hover:bg-olive-dark" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editingUnit ? 'Save Changes' : 'Create Unit'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isRuleModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-text-dark">
                  {editingRule ? 'Edit Box Pack Rule' : 'Add Box Pack Rule'}
                </h2>
                <p className="text-sm text-text-dark/70">Select the box, packet unit, and quantity rule.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsRuleModalOpen(false)}
                disabled={isSubmitting}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <form className="space-y-4 px-6 py-6" onSubmit={handleSubmitRule}>
              <div>
                <Label htmlFor="rule-box">Box Unit</Label>
                <select
                  id="rule-box"
                  name="box_unit_id"
                  value={ruleForm.box_unit_id}
                  onChange={handleRuleFieldChange}
                  className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                  disabled={isSubmitting}
                >
                  <option value="">Select box unit</option>
                  {boxOptions.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code} - {unit.name} {!unit.is_active ? '(inactive)' : ''}
                    </option>
                  ))}
                </select>
                {ruleFormErrors.box_unit_id ? (
                  <p className="mt-1 text-sm text-red-600">{ruleFormErrors.box_unit_id}</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="rule-packet">Packet Unit</Label>
                <select
                  id="rule-packet"
                  name="packet_unit_id"
                  value={ruleForm.packet_unit_id}
                  onChange={handleRuleFieldChange}
                  className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                  disabled={isSubmitting}
                >
                  <option value="">Select packet unit</option>
                  {packetOptions.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code} - {unit.name} {!unit.is_active ? '(inactive)' : ''}
                    </option>
                  ))}
                </select>
                {ruleFormErrors.packet_unit_id ? (
                  <p className="mt-1 text-sm text-red-600">{ruleFormErrors.packet_unit_id}</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="rule-qty">Packets Per Box</Label>
                <Input
                  id="rule-qty"
                  name="packets_per_box"
                  type="number"
                  min="1"
                  value={ruleForm.packets_per_box}
                  onChange={handleRuleFieldChange}
                  className="mt-1"
                  disabled={isSubmitting}
                />
                {ruleFormErrors.packets_per_box ? (
                  <p className="mt-1 text-sm text-red-600">{ruleFormErrors.packets_per_box}</p>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-olive-light/20 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsRuleModalOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-olive hover:bg-olive-dark" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editingRule ? 'Save Changes' : 'Create Rule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </PageLayout>
  )
}

export default PackagingManagement
