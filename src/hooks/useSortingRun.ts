import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { ProcessSortingOutput, ProcessSortingWaste } from '@/types/processExecution'

interface UseSortingRunOptions {
  stepRunId: number | null
  enabled?: boolean
  mode?: 'sorting' | 'grading'
}

interface UseSortingRunReturn {
  outputs: ProcessSortingOutput[]
  waste: ProcessSortingWaste[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<void>
  addOutput: (data: {
    product_id: number
    quantity_kg: number
    moisture_percent?: number | null
    remarks?: string | null
  }) => Promise<void>
  updateOutput: (outputId: number, data: {
    product_id?: number
    quantity_kg?: number
    moisture_percent?: number | null
    remarks?: string | null
  }) => Promise<void>
  deleteOutput: (outputId: number) => Promise<void>
  addWaste: (wasteData: { sorting_run_id?: number; process_step_run_id?: number; waste_type: string; quantity_kg: number }) => Promise<void>
  deleteWaste: (wasteId: number) => Promise<void>
}

export function useSortingRun(options: UseSortingRunOptions): UseSortingRunReturn {
  const { stepRunId, enabled = true, mode = 'sorting' } = options
  const outputsTable = mode === 'grading' ? 'process_grading_outputs' : 'process_sorting_outputs'
  const wasteTable = mode === 'grading' ? 'process_grading_waste' : 'process_sorting_waste'
  const [outputs, setOutputs] = useState<ProcessSortingOutput[]>([])
  const [waste, setWaste] = useState<ProcessSortingWaste[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchData = useCallback(async () => {
    if (!stepRunId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Fetch outputs with product info
    const { data: outputsData, error: outputsError } = await supabase
      .from(outputsTable)
      .select(`
        *,
        product:products(id, name, sku)
      `)
      .eq('process_step_run_id', stepRunId)
      .order('created_at', { ascending: false })

    if (outputsError) {
      setError(outputsError)
      setOutputs([])
    } else {
      const formattedOutputs = (outputsData || []).map((output: any) => ({
        ...output,
        product: output.product ? {
          id: output.product.id,
          name: output.product.name,
          sku: output.product.sku,
        } : undefined,
      }))
      setOutputs(formattedOutputs as ProcessSortingOutput[])

      if (mode === 'grading') {
        const outputIds = formattedOutputs.map((o: ProcessSortingOutput) => o.id)
        const [{ data: wasteByStepRun, error: stepWasteError }, wasteByOutputResult] = await Promise.all([
          supabase
            .from(wasteTable)
            .select('*')
            .eq('process_step_run_id', stepRunId)
            .order('created_at', { ascending: false }),
          outputIds.length > 0
            ? supabase
                .from(wasteTable)
                .select('*')
                .in('sorting_run_id', outputIds)
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [], error: null }),
        ])

        if (stepWasteError || wasteByOutputResult.error) {
          setError(stepWasteError ?? wasteByOutputResult.error)
          setWaste([])
        } else {
          const merged = [...(wasteByStepRun ?? []), ...(wasteByOutputResult.data ?? [])]
          const uniqueById = Array.from(new Map(merged.map((row: any) => [row.id, row])).values())
          setWaste(uniqueById as ProcessSortingWaste[])
        }
      } else if (formattedOutputs.length > 0) {
        const outputIds = formattedOutputs.map((o: ProcessSortingOutput) => o.id)
        const { data: wasteData, error: wasteError } = await supabase
          .from(wasteTable)
          .select('*')
          .in('sorting_run_id', outputIds)
          .order('created_at', { ascending: false })

        if (wasteError) {
          setError(wasteError)
          setWaste([])
        } else {
          setWaste((wasteData as ProcessSortingWaste[]) || [])
        }
      } else {
        setWaste([])
      }
    }

    setLoading(false)
  }, [stepRunId, enabled, mode, outputsTable, wasteTable])

  const addOutput = useCallback(
    async (data: {
      product_id: number
      quantity_kg: number
      moisture_percent?: number | null
      remarks?: string | null
    }) => {
      if (!stepRunId) {
        throw new Error('Step run ID is required')
      }
      const { data: insertedOutput, error: insertError } = await supabase
        .from(outputsTable)
        .insert({
          process_step_run_id: stepRunId,
          ...data,
        })
        .select(`
          *,
          product:products(id, name, sku)
        `)
        .single()

      if (insertError) {
        throw insertError
      }

      if (insertedOutput) {
        const formattedOutput = {
          ...(insertedOutput as any),
          product: (insertedOutput as any).product
            ? {
                id: (insertedOutput as any).product.id,
                name: (insertedOutput as any).product.name,
                sku: (insertedOutput as any).product.sku,
              }
            : undefined,
        } as ProcessSortingOutput

        setOutputs((prev) => [formattedOutput, ...prev])
        return
      }

      await fetchData()
    },
    [stepRunId, fetchData, outputsTable]
  )

  const updateOutput = useCallback(
    async (
      outputId: number,
      data: {
        product_id?: number
        quantity_kg?: number
        moisture_percent?: number | null
        remarks?: string | null
      }
    ) => {
      const { data: updatedOutput, error: updateError } = await supabase
        .from(outputsTable)
        .update(data)
        .eq('id', outputId)
        .select(`
          *,
          product:products(id, name, sku)
        `)
        .single()

      if (updateError) {
        throw updateError
      }

      if (updatedOutput) {
        const formattedOutput = {
          ...(updatedOutput as any),
          product: (updatedOutput as any).product
            ? {
                id: (updatedOutput as any).product.id,
                name: (updatedOutput as any).product.name,
                sku: (updatedOutput as any).product.sku,
              }
            : undefined,
        } as ProcessSortingOutput

        setOutputs((prev) =>
          prev.map((output) => (output.id === outputId ? formattedOutput : output))
        )
        return
      }

      await fetchData()
    },
    [fetchData, outputsTable]
  )

  const deleteOutput = useCallback(
    async (outputId: number) => {
      const { error: deleteError } = await supabase
        .from(outputsTable)
        .delete()
        .eq('id', outputId)

      if (deleteError) {
        throw deleteError
      }

      setOutputs((prev) => prev.filter((output) => output.id !== outputId))
      setWaste((prev) => prev.filter((wasteRow) => wasteRow.sorting_run_id !== outputId))
    },
    [outputsTable]
  )

  const addWaste = useCallback(
    async (wasteData: { sorting_run_id?: number; process_step_run_id?: number; waste_type: string; quantity_kg: number }) => {
      const insertPayload =
        mode === 'grading'
          ? {
              process_step_run_id: wasteData.process_step_run_id ?? stepRunId,
              sorting_run_id: wasteData.sorting_run_id ?? null,
              waste_type: wasteData.waste_type,
              quantity_kg: wasteData.quantity_kg,
            }
          : {
              sorting_run_id: wasteData.sorting_run_id,
              waste_type: wasteData.waste_type,
              quantity_kg: wasteData.quantity_kg,
            }

      const { data: insertedWaste, error: insertError } = await supabase
        .from(wasteTable)
        .insert(insertPayload)
        .select('*')
        .single()

      if (insertError) {
        throw insertError
      }

      if (insertedWaste) {
        setWaste((prev) => [insertedWaste as ProcessSortingWaste, ...prev])
        return
      }

      await fetchData()
    },
    [fetchData, wasteTable, mode, stepRunId]
  )

  const deleteWaste = useCallback(
    async (wasteId: number) => {
      const { error: deleteError } = await supabase
        .from(wasteTable)
        .delete()
        .eq('id', wasteId)

      if (deleteError) {
        throw deleteError
      }

      setWaste((prev) => prev.filter((row) => row.id !== wasteId))
    },
    [wasteTable]
  )

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    outputs,
    waste,
    loading,
    error,
    refresh: fetchData,
    addOutput,
    updateOutput,
    deleteOutput,
    addWaste,
    deleteWaste,
  }
}
