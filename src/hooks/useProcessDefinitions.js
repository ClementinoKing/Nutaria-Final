import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export function useProcessDefinitions(options = {}) {
  const { includeProcessedLots = false } = options
  const [processes, setProcesses] = useState([])
  const [processSteps, setProcessSteps] = useState(new Map())
  const [lots, setLots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchProcesses = useCallback(async () => {
    const { data, error: processesError } = await supabase
      .from('processes')
      .select('*')
      .order('name', { ascending: true })

    if (processesError) {
      return { error: processesError }
    }

    return { data: data ?? [] }
  }, [])

  const fetchProcessSteps = useCallback(async () => {
    const { data, error: stepsError } = await supabase
      .from('process_steps')
      .select('*')
      .order('process_id', { ascending: true })
      .order('seq', { ascending: true })

    if (stepsError) {
      return { error: stepsError }
    }

    const grouped = new Map()

    ;(data ?? []).forEach((step) => {
      if (!grouped.has(step.process_id)) {
        grouped.set(step.process_id, [])
      }
      grouped.get(step.process_id).push(step)
    })

    return { data: grouped }
  }, [])

  const fetchLots = useCallback(async () => {
    const baseQuery = supabase
      .from('supply_batches')
      .select(
        `
        id,
        lot_no,
        supply_id,
        product_id,
        unit_id,
        received_qty,
        accepted_qty,
        rejected_qty,
        current_qty,
        process_status,
        quality_status,
        expiry_date,
        created_at,
        supplies (
          doc_no,
          received_at,
          supplier_id,
          warehouse_id
        ),
        products (
          name,
          sku
        ),
        units (
          name,
          symbol
        )
      `,
        { count: 'estimated' },
      )
      .order('created_at', { ascending: false, nullsFirst: false })

    if (!includeProcessedLots) {
      baseQuery.in('process_status', ['UNPROCESSED', 'PROCESSING'])
    }

    const { data, error: lotsError } = await baseQuery

    if (lotsError) {
      return { error: lotsError }
    }

    return { data: data ?? [] }
  }, [includeProcessedLots])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [processesResult, stepsResult, lotsResult] = await Promise.all([
      fetchProcesses(),
      fetchProcessSteps(),
      fetchLots(),
    ])

    const firstError = processesResult.error || stepsResult.error || lotsResult.error

    if (firstError) {
      setError(firstError)
    } else {
      setProcesses(processesResult.data)
      setProcessSteps(stepsResult.data)
      setLots(lotsResult.data)
    }

    setLoading(false)
  }, [fetchLots, fetchProcessSteps, fetchProcesses])

  useEffect(() => {
    refresh()
  }, [refresh])

  const processesByProductId = useMemo(() => {
    const map = new Map()
    processes.forEach((processDefinition) => {
      const productIds = Array.isArray(processDefinition.product_ids) ? processDefinition.product_ids : []
      productIds.forEach((productId) => {
        if (!map.has(productId)) {
          map.set(productId, [])
        }
        map.get(productId).push(processDefinition)
      })
    })
    return map
  }, [processes])

  return {
    processes,
    processSteps,
    processesByProductId,
    lots,
    loading,
    error,
    refresh,
  }
}


