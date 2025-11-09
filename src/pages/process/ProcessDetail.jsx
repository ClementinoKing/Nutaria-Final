import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import PageLayout from '@/components/layout/PageLayout'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Clock, CheckCircle2, Shield, MapPin, Layers } from 'lucide-react'

function parseInterval(value) {
  if (!value) {
    return { display: null, hours: null }
  }

  const buildResult = (hours = 0, minutes = 0, seconds = 0) => {
    const totalHours = hours + minutes / 60 + seconds / 3600
    const parts = []
    if (hours > 0) {
      parts.push(`${hours}h`)
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`)
    }
    if (seconds > 0 && parts.length === 0) {
      parts.push(`${seconds}s`)
    }
    const display = parts.join(' ') || '0m'
    return { display, hours: Number.isFinite(totalHours) ? totalHours : null }
  }

  if (typeof value === 'number') {
    const totalSeconds = Math.max(0, value)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return buildResult(hours, minutes, seconds)
  }

  if (typeof value === 'string') {
    if (value.startsWith('P')) {
      const hoursMatch = value.match(/(\d+)H/)
      const minutesMatch = value.match(/(\d+)M/)
      const secondsMatch = value.match(/(\d+)S/)
      const hours = hoursMatch ? Number(hoursMatch[1]) : 0
      const minutes = minutesMatch ? Number(minutesMatch[1]) : 0
      const seconds = secondsMatch ? Number(secondsMatch[1]) : 0
      return buildResult(hours, minutes, seconds)
    }

    const colonMatch = value.match(/^(-?\d+):(\d{2}):(\d{2})(?:\.\d+)?$/)
    if (colonMatch) {
      const hours = Number(colonMatch[1])
      const minutes = Number(colonMatch[2])
      const seconds = Number(colonMatch[3])
      return buildResult(hours, minutes, seconds)
    }

    const numericValue = Number(value)
    if (!Number.isNaN(numericValue)) {
      return buildResult(0, numericValue, 0)
    }

    return { display: value, hours: null }
  }

  return { display: null, hours: null }

}

function ProcessDetail() {
  const { processId } = useParams()
  const navigate = useNavigate()
  const [process, setProcess] = useState(null)
  const [steps, setSteps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    const numericId = Number(processId)

    if (Number.isNaN(numericId)) {
      setError(new Error('Invalid process id.'))
      setProcess(null)
      setSteps([])
      setLoading(false)
      return
    }

    const fetchProcessData = async () => {
      setLoading(true)
      setError(null)

      const [processResult, stepsResult] = await Promise.all([
        supabase
          .from('processes')
          .select('id, code, name, description, created_at, updated_at')
          .eq('id', numericId)
          .maybeSingle(),
        supabase
          .from('process_steps')
          .select('id, seq, step_code, step_name, description, requires_qc, default_location_id, estimated_duration, default_location:warehouses ( id, name )')
          .eq('process_id', numericId)
          .order('seq', { ascending: true }),
      ])

      if (!active) {
        return
      }

      if (processResult.error) {
        console.error('Error fetching process', processResult.error)
        setError(processResult.error)
        setProcess(null)
      } else {
        setProcess(processResult.data ?? null)
      }

      if (stepsResult.error) {
        console.error('Error fetching process steps', stepsResult.error)
        setError((prev) => prev ?? stepsResult.error)
        setSteps([])
      } else {
        const normalizedSteps = Array.isArray(stepsResult.data)
          ? stepsResult.data.map((step) => ({
              id: step.id,
              seq: step.seq,
              step_code: step.step_code,
              step_name: step.step_name,
              description: step.description ?? 'No description provided.',
              requires_qc: Boolean(step.requires_qc),
              default_location_id: step.default_location_id,
              default_location_name: step.default_location?.name ?? null,
              ...(() => {
                const interval = parseInterval(step.estimated_duration)
                return {
                  estimated_duration: interval.display,
                  estimated_duration_hours: interval.hours,
                }
              })(),
            }))
          : []
        setSteps(normalizedSteps)
      }

      setLoading(false)
    }

    fetchProcessData().catch((fetchError) => {
      if (!active) {
        return
      }
      console.error('Unexpected error fetching process detail', fetchError)
      setError(fetchError)
      setProcess(null)
      setSteps([])
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [processId])

  const totalSteps = steps.length
  const qcSteps = useMemo(() => steps.filter((step) => step.requires_qc).length, [steps])
  const uniqueLocations = useMemo(
    () => [...new Set(steps.map((step) => step.default_location_name).filter(Boolean))],
    [steps],
  )
  const totalEstimatedDuration = useMemo(
    () =>
      steps.reduce(
        (acc, step) =>
          acc + (typeof step.estimated_duration_hours === 'number' && Number.isFinite(step.estimated_duration_hours) ? step.estimated_duration_hours : 0),
        0,
      ),
    [steps],
  )

  if (loading) {
    return (
      <PageLayout
        title="Loading process…"
        activeItem="settings"
        actions={
          <Button variant="outline" onClick={() => navigate(-1)} className="border-olive-light/40 text-olive hover:text-olive-dark">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-10 py-8"
      >
        <div className="flex min-h-[40vh] items-center justify-center text-text-dark/70">Loading process details…</div>
      </PageLayout>
    )
  }

  if (error || !process) {
    return (
      <PageLayout title="Process Not Found" activeItem="settings">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <Layers className="h-12 w-12 text-olive" />
          <div>
            <h2 className="text-2xl font-semibold text-text-dark">
              {error ? 'Unable to load process' : 'Process not found'}
            </h2>
            <p className="mt-2 text-sm text-text-dark/70">
              {error
                ? 'We encountered a problem while loading this process. Please try again later.'
                : 'We couldn’t find the process you were looking for. It may have been removed or the URL is incorrect.'}
            </p>
          </div>
          <Button onClick={() => navigate(-1)} className="bg-olive hover:bg-olive-dark">
            Go back
          </Button>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title={`${process.name}`}
      activeItem="settings"
      actions={
        <Button variant="outline" onClick={() => navigate(-1)} className="border-olive-light/40 text-olive hover:text-olive-dark">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-10 py-8"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card className="bg-white border-olive-light/30">
            <CardHeader className="space-y-2">
              <span className="inline-flex w-fit items-center rounded-full border border-olive-light/40 bg-olive-light/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-olive-dark">
                {process.code}
              </span>
              <CardTitle className="text-2xl text-text-dark">{process.name}</CardTitle>
              <CardDescription className="text-text-dark/80">
                {process.description || 'No description available for this process.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                <div className="text-sm font-medium text-text-dark/70">Created</div>
                <div className="mt-2 text-lg font-semibold text-text-dark">
                  {new Date(process.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                <div className="text-sm font-medium text-text-dark/70">Total Steps</div>
                <div className="mt-2 text-lg font-semibold text-text-dark">{totalSteps}</div>
              </div>
              <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                <div className="text-sm font-medium text-text-dark/70">Quality Checks</div>
                <div className="mt-2 text-lg font-semibold text-text-dark">{qcSteps}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-olive-light/30">
            <CardHeader>
              <CardTitle className="text-text-dark">Process Steps</CardTitle>
              <CardDescription className="text-text-dark/70">
                Detailed view of each step in this process sequence
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {steps.map((step) => (
                  <li key={step.id} className="group relative rounded-xl border border-olive-light/30 bg-olive-light/10 p-4 sm:p-6 transition-all duration-200 hover:border-olive/60 hover:bg-white hover:shadow-md">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-olive px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">{`Step ${step.seq}`}</span>
                          <span className="text-xs font-mono uppercase tracking-wide text-text-dark/60">{step.step_code}</span>
                        </div>
                        <h3 className="mt-3 text-lg font-semibold text-text-dark">{step.step_name}</h3>
                      </div>
                      <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-olive shadow">
                        <Clock className="h-4 w-4" />
                        <span>{step.estimated_duration || '—'}</span>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-text-dark/80">{step.description}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-olive-light/20 pt-4 text-sm text-text-dark/70">
                      <div className="flex items-center gap-2">
                        {step.requires_qc ? (
                          <>
                            <Shield className="h-4 w-4 text-olive" />
                            <span className="font-medium text-text-dark">Quality check required</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-olive" />
                            <span>Optional quality check</span>
                          </>
                        )}
                      </div>
                      {step.default_location_name && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-olive" />
                          <span>
                            Default location:{' '}
                            <span className="font-medium text-text-dark">{step.default_location_name}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              {steps.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-text-dark/60">
                  <Layers className="h-10 w-10" />
                  <div>
                    <p className="font-medium text-text-dark">No steps defined yet</p>
                    <p className="text-sm">Add steps to this process to see them listed here.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="border-olive-light/30 bg-white">
            <CardHeader>
              <CardTitle className="text-text-dark text-lg">Summary</CardTitle>
              <CardDescription className="text-text-dark/70">
                Key metrics and requirements for this process
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                <div>
                  <p className="text-sm font-medium text-text-dark/70">Requires QC</p>
                  <p className="mt-1 text-lg font-semibold text-text-dark">
                    {qcSteps > 0 ? `${qcSteps} of ${totalSteps} steps` : 'No steps'}
                  </p>
                </div>
                <Shield className="h-8 w-8 text-olive" />
              </div>
              <div className="rounded-lg border border-olive-light/30 p-4">
                <p className="text-sm font-medium text-text-dark/70">Default locations used</p>
                <ul className="mt-2 space-y-1 text-sm text-text-dark">
                  {uniqueLocations.map((location) => (
                    <li key={location} className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-olive" />
                      <span>{location}</span>
                    </li>
                  ))}
                  {steps.every((step) => !step.default_location_name) && (
                    <li className="text-text-dark/60">No default locations configured.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-lg border border-olive-light/30 p-4">
                <p className="text-sm font-medium text-text-dark/70">Estimated duration</p>
                <p className="mt-2 text-lg font-semibold text-text-dark">
                  {steps.length > 0 && totalEstimatedDuration > 0 ? `${totalEstimatedDuration.toFixed(1)}h` : '—'}
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </PageLayout>
  )
}

export default ProcessDetail


