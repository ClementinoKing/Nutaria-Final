import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Edit, Trash2, X, Minus, Eye } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'

const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function parseDate(value) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

function formatDate(value) {
  const date = parseDate(value)
  if (!date) {
    return '—'
  }
  return dateFormatter.format(date)
}

function Processes() {
  const [processes, setProcesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [warehouses, setWarehouses] = useState([])
  const [warehousesLoading, setWarehousesLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    steps: []
  })
  const navigate = useNavigate()

  const fetchProcesses = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('processes')
      .select('id, code, name, description, created_at')
      .order('created_at', { ascending: false, nullsFirst: false })

    if (fetchError) {
      console.error('Error fetching processes', fetchError)
      setError(fetchError)
      toast.error(fetchError.message ?? 'Unable to load processes from Supabase.')
      setProcesses([])
      setLoading(false)
      return
    }

    setProcesses(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  const fetchWarehouses = useCallback(async () => {
    setWarehousesLoading(true)

    const { data, error: fetchError } = await supabase
      .from('warehouses')
      .select('id, name')
      .order('name', { ascending: true })

    if (fetchError) {
      console.error('Error fetching warehouses for processes form', fetchError)
      toast.error(fetchError.message ?? 'Unable to load warehouses from Supabase.')
      setWarehouses([])
      setWarehousesLoading(false)
      return
    }

    setWarehouses(Array.isArray(data) ? data : [])
    setWarehousesLoading(false)
  }, [])

  useEffect(() => {
    fetchProcesses()
  }, [fetchProcesses])

  useEffect(() => {
    fetchWarehouses()
  }, [fetchWarehouses])

  const handleOpenModal = () => {
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setIsSubmitting(false)
    setFormData({
      code: '',
      name: '',
      description: '',
      steps: []
    })
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleAddStep = () => {
    const newStep = {
      id: Date.now(), // temporary ID for React key
      seq: formData.steps.length + 1,
      step_code: '',
      step_name: '',
      requires_qc: false,
      default_location_id: ''
    }
    setFormData(prev => ({
      ...prev,
      steps: [...prev.steps, newStep]
    }))
  }

  const handleRemoveStep = (stepId) => {
    const updatedSteps = formData.steps
      .filter(step => step.id !== stepId)
      .map((step, index) => ({
        ...step,
        seq: index + 1
      }))
    setFormData(prev => ({
      ...prev,
      steps: updatedSteps
    }))
  }

  const handleStepChange = (stepId, field, value) => {
    setFormData(prev => ({
      ...prev,
      steps: prev.steps.map(step =>
        step.id === stepId ? { ...step, [field]: value } : step
      )
    }))
  }

  const validateForm = () => {
    const trimmedCode = formData.code.trim()
    const trimmedName = formData.name.trim()

    if (!trimmedCode || !trimmedName) {
      toast.error('Please fill in all required fields (Code and Name).')
      return false
    }

    const invalidSteps = formData.steps.filter(
      step => !(step.step_code ?? '').trim() || !(step.step_name ?? '').trim()
    )
    if (invalidSteps.length > 0) {
      toast.error('Please fill in all required fields for each step (Step Code and Step Name).')
      return false
    }

    return true
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    try {
      const processPayload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
      }

      const { data: insertedProcess, error: insertProcessError } = await supabase
        .from('processes')
        .insert(processPayload)
        .select('id, code, name, description, created_at')
        .single()

      if (insertProcessError) {
        throw insertProcessError
      }

      if (Array.isArray(formData.steps) && formData.steps.length > 0) {
        const stepsPayload = formData.steps.map((step, index) => ({
          process_id: insertedProcess.id,
          seq: index + 1,
          step_code: (step.step_code ?? '').trim(),
          step_name: (step.step_name ?? '').trim(),
          description: null,
          requires_qc: Boolean(step.requires_qc),
          default_location_id: step.default_location_id ? Number(step.default_location_id) : null,
          estimated_duration: null,
        }))

        const { error: insertStepsError } = await supabase
          .from('process_steps')
          .insert(stepsPayload)

        if (insertStepsError) {
          // Attempt to roll back the created process for consistency
          await supabase.from('processes').delete().eq('id', insertedProcess.id)
          throw insertStepsError
        }
      }

      toast.success('Process added successfully.')
      setProcesses(previous => (insertedProcess ? [insertedProcess, ...previous] : previous))
      handleCloseModal()
    } catch (submitError) {
      console.error('Error creating process', submitError)
      toast.error(submitError.message ?? 'Unable to add process.')
      setIsSubmitting(false)
    } finally {
      fetchProcesses()
    }
  }

  const emptyMessage = useMemo(() => {
    if (loading) {
      return 'Loading processes…'
    }
    if (error) {
      return 'Unable to load processes.'
    }
    return 'No processes found.'
  }, [error, loading])

  const columns = [
    {
      key: 'code',
      header: 'Code',
      accessor: 'code',
      cellClassName: 'font-medium text-text-dark',
    },
    {
      key: 'name',
      header: 'Name',
      accessor: 'name',
    },
    {
      key: 'description',
      header: 'Description',
      render: (process) => process.description || '-',
      mobileRender: (process) => process.description || '-',
      cellClassName: 'text-text-dark/70',
      mobileValueClassName: 'text-text-dark',
    },
    {
      key: 'created_at',
      header: 'Created At',
      render: (process) => formatDate(process.created_at),
      mobileRender: (process) => formatDate(process.created_at),
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-sm text-text-dark',
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      mobileValueClassName: 'flex w-full justify-end gap-2',
      render: (process) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              event.preventDefault()
              navigate(`/process/processes/${process.id}`)
            }}
            className="text-olive hover:text-olive-dark"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm">
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      mobileRender: (process) => (
        <div className="flex w-full justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              event.preventDefault()
              navigate(`/process/processes/${process.id}`)
            }}
            className="text-olive hover:text-olive-dark"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm">
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <PageLayout
      title="Factory Processes"
      activeItem="settings"
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenModal}>
          <Plus className="h-4 w-4 mr-2" />
          New Process
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Factory Processes</CardTitle>
          <CardDescription>Manage factory processing workflows</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.message ?? 'Unable to load processes from Supabase.'}
            </div>
          ) : null}
          <ResponsiveTable
            columns={columns}
            data={loading ? [] : processes}
            rowKey="id"
            emptyMessage={emptyMessage}
          />
        </CardContent>
      </Card>

      {/* Add Process Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-olive-light/20 p-4 sm:p-6">
              <h2 className="text-2xl font-bold text-text-dark">Add New Process</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCloseModal}
                className="text-text-dark hover:bg-olive-light/10"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-text-dark">
                    Code <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="code"
                    name="code"
                    type="text"
                    placeholder="e.g., PROC-004"
                    value={formData.code}
                    onChange={handleInputChange}
                    className="bg-white"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name" className="text-text-dark">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="e.g., Almond Processing"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="bg-white"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-text-dark">
                    Description
                  </Label>
                  <textarea
                    id="description"
                    name="description"
                    placeholder="Enter process description..."
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={4}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                {/* Process Steps Section */}
                <div className="space-y-3 pt-4 border-t border-olive-light/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-text-dark text-base font-semibold">
                      Process Steps
                    </Label>
                    <Button
                      type="button"
                      onClick={handleAddStep}
                      variant="outline"
                      size="sm"
                      className="border-olive-light/30"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Step
                    </Button>
                  </div>

                  {formData.steps.length === 0 ? (
                    <p className="text-sm text-text-dark/60 italic py-2">
                      No steps added. Click "Add Step" to create process steps.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {formData.steps.map((step, index) => (
                        <div
                          key={step.id}
                          className="bg-olive-light/5 border border-olive-light/20 rounded-lg p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-text-dark">
                                Step {step.seq}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveStep(step.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-text-dark">
                                Step Code <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                type="text"
                                placeholder="e.g., STEP-001"
                                value={step.step_code}
                                onChange={(e) =>
                                  handleStepChange(step.id, 'step_code', e.target.value)
                                }
                                className="bg-white text-sm"
                                required
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs text-text-dark">
                                Step Name <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                type="text"
                                placeholder="e.g., Receiving & Inspection"
                                value={step.step_name}
                                onChange={(e) =>
                                  handleStepChange(step.id, 'step_name', e.target.value)
                                }
                                className="bg-white text-sm"
                                required
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-text-dark">
                                Default Location
                              </Label>
                              <select
                                value={step.default_location_id}
                                onChange={(e) =>
                                  handleStepChange(step.id, 'default_location_id', e.target.value)
                                }
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                <option value="">Select location</option>
                                {warehouses.map((warehouse) => (
                                  <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.name}
                                  </option>
                                ))}
                              </select>
                              {warehousesLoading && (
                                <p className="text-xs text-text-dark/60 mt-1">Loading locations…</p>
                              )}
                            </div>

                            <div className="space-y-1 flex items-end">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id={`requires_qc_${step.id}`}
                                  checked={step.requires_qc}
                                  onChange={(e) =>
                                    handleStepChange(step.id, 'requires_qc', e.target.checked)
                                  }
                                  className="h-4 w-4 rounded border-input text-olive focus:ring-olive"
                                />
                                <Label
                                  htmlFor={`requires_qc_${step.id}`}
                                  className="text-xs text-text-dark cursor-pointer"
                                >
                                  Requires Quality Check
                                </Label>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="mt-6 flex flex-col gap-3 border-t border-olive-light/20 pt-6 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseModal}
                  className="border-olive-light/30"
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-olive hover:bg-olive-dark" disabled={isSubmitting}>
                  Add Process
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default Processes

