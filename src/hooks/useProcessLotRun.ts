import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { ProcessLotRunWithDetails } from '@/types/processExecution'

interface UseProcessLotRunOptions {
  lotRunId: number | null
  enabled?: boolean
}

interface UseProcessLotRunReturn {
  lotRun: ProcessLotRunWithDetails | null
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<void>
}

export function useProcessLotRun(options: UseProcessLotRunOptions): UseProcessLotRunReturn {
  const { lotRunId, enabled = true } = options
  const [lotRun, setLotRun] = useState<ProcessLotRunWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchLotRun = useCallback(async () => {
    if (!lotRunId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('process_lot_runs')
      .select(`
        id,
        supply_batch_id,
        process_id,
        status,
        started_at,
        completed_at,
        created_at,
        updated_at,
        supply_batches:supply_batch_id (
          id,
          lot_no,
          product_id,
          current_qty,
          unit_id,
          process_status,
          quality_status,
          products:product_id (
            name,
            sku
          ),
          units:unit_id (
            name,
            symbol
          )
        ),
        processes:process_id (
          id,
          code,
          name,
          description
        ),
        process_signoffs (
          id,
          process_lot_run_id,
          role,
          signed_by,
          signed_at
        ),
        process_lot_run_batches (
          id,
          process_lot_run_id,
          supply_batch_id,
          is_primary,
          created_at,
          supply_batches:supply_batch_id (
            id,
            lot_no,
            product_id,
            current_qty,
            unit_id,
            process_status,
            quality_status,
            products:product_id (
              name,
              sku
            ),
            units:unit_id (
              name,
              symbol
            )
          )
        )
      `)
      .eq('id', lotRunId)
      .single()

    if (fetchError) {
      setError(fetchError)
      setLotRun(null)
    } else {
      const normalized = {
        ...(data as Record<string, unknown>),
        run_lots: ((data as any)?.process_lot_run_batches || []).map((row: any) => ({
          id: row.id,
          process_lot_run_id: row.process_lot_run_id,
          supply_batch_id: row.supply_batch_id,
          is_primary: row.is_primary,
          created_at: row.created_at,
          supply_batch: Array.isArray(row.supply_batches) ? row.supply_batches[0] : row.supply_batches,
        })),
      }
      setLotRun(normalized as ProcessLotRunWithDetails)
    }

    setLoading(false)
  }, [lotRunId, enabled])

  useEffect(() => {
    fetchLotRun()
  }, [fetchLotRun])

  return {
    lotRun,
    loading,
    error,
    refresh: fetchLotRun,
  }
}
