import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import PageLayout from '@/components/layout/PageLayout'
import { Spinner } from '@/components/ui/spinner'

function LegacyProcessStepsRedirect() {
  const { lotId: lotIdParam } = useParams<{ lotId: string }>()
  const navigate = useNavigate()

  useEffect(() => {
    const resolveRoute = async () => {
      const lotId = Number.parseInt(lotIdParam ?? '', 10)
      if (!Number.isFinite(lotId)) {
        navigate('/process/process-steps', { replace: true })
        return
      }

      const fromBridge = await supabase
        .from('process_lot_run_batches')
        .select('process_lot_run_id')
        .eq('supply_batch_id', lotId)
        .maybeSingle()

      if (fromBridge.data?.process_lot_run_id) {
        navigate(`/process/process-steps/run/${fromBridge.data.process_lot_run_id}`, { replace: true })
        return
      }

      const fallback = await supabase
        .from('process_lot_runs')
        .select('id')
        .eq('supply_batch_id', lotId)
        .maybeSingle()

      if (fallback.data?.id) {
        navigate(`/process/process-steps/run/${fallback.data.id}`, { replace: true })
        return
      }

      toast.info('No process run exists yet for this lot')
      navigate('/process/process-steps', { replace: true })
    }

    resolveRoute().catch((error) => {
      console.error('Failed to resolve legacy process route:', error)
      navigate('/process/process-steps', { replace: true })
    })
  }, [lotIdParam, navigate])

  return (
    <PageLayout title="Redirecting" activeItem="process" contentClassName="py-8">
      <Spinner text="Resolving process run..." />
    </PageLayout>
  )
}

export default LegacyProcessStepsRedirect
