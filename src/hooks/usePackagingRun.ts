import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type {
  ProcessPackagingRun,
  ProcessPackagingWeightCheck,
  ProcessPackagingPhoto,
  ProcessPackagingWaste,
  ProcessPackagingPackEntry,
  ProcessPackagingMetalCheck,
  ProcessPackagingMetalCheckRejection,
} from '@/types/processExecution'

interface UsePackagingRunOptions {
  stepRunId: number | null
  enabled?: boolean
}

interface AddMetalCheckAttemptInput {
  sorting_output_id: number
  status: 'PASS' | 'FAIL'
  remarks?: string | null
  rejections?: Array<{
    object_type: string
    weight_kg: number
    corrective_action?: string | null
  }>
}

interface UsePackagingRunReturn {
  packagingRun: ProcessPackagingRun | null
  weightChecks: ProcessPackagingWeightCheck[]
  photos: ProcessPackagingPhoto[]
  waste: ProcessPackagingWaste[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<void>
  savePackagingRun: (data: Partial<ProcessPackagingRun>) => Promise<void>
  addWeightCheck: (check: { check_no: number; weight_kg: number }) => Promise<void>
  updateWeightCheck: (checkId: number, data: { check_no?: number; weight_kg?: number }) => Promise<void>
  deleteWeightCheck: (checkId: number) => Promise<void>
  addPhoto: (photo: { photo_type: 'product' | 'label' | 'pallet'; file_path: string }) => Promise<void>
  deletePhoto: (photoId: number) => Promise<void>
  addWaste: (wasteData: { waste_type: string; quantity_kg: number }) => Promise<void>
  deleteWaste: (wasteId: number) => Promise<void>
  packEntries: ProcessPackagingPackEntry[]
  addPackEntry: (data: {
    sorting_output_id: number
    product_id: number | null
    pack_identifier: string
    quantity_kg: number
    packing_type: string | null
    pack_size_kg?: number | null
  }) => Promise<void>
  deletePackEntry: (id: number) => Promise<void>
  metalChecksBySortingOutput: Record<number, ProcessPackagingMetalCheck[]>
  getLatestMetalCheck: (sortingOutputId: number) => ProcessPackagingMetalCheck | null
  getFailedRejectedWeightBySortingOutput: (sortingOutputId: number) => number
  refreshMetalChecks: () => Promise<void>
  addMetalCheckAttempt: (input: AddMetalCheckAttemptInput) => Promise<void>
}

export function usePackagingRun(options: UsePackagingRunOptions): UsePackagingRunReturn {
  const { stepRunId, enabled = true } = options
  const [packagingRun, setPackagingRun] = useState<ProcessPackagingRun | null>(null)
  const [packEntries, setPackEntries] = useState<ProcessPackagingPackEntry[]>([])
  const [metalChecksBySortingOutput, setMetalChecksBySortingOutput] = useState<Record<number, ProcessPackagingMetalCheck[]>>({})
  const [weightChecks, setWeightChecks] = useState<ProcessPackagingWeightCheck[]>([])
  const [photos, setPhotos] = useState<ProcessPackagingPhoto[]>([])
  const [waste, setWaste] = useState<ProcessPackagingWaste[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchMetalChecks = useCallback(async (packagingRunId: number) => {
    const { data: checksData, error: checksError } = await supabase
      .from('process_packaging_metal_checks')
      .select('*')
      .eq('packaging_run_id', packagingRunId)
      .order('attempt_no', { ascending: true })

    if (checksError) {
      setMetalChecksBySortingOutput({})
      return
    }

    const checks = (checksData as ProcessPackagingMetalCheck[]) || []
    const checkIds = checks.map((check) => check.id)
    let rejectionsByCheckId: Record<number, ProcessPackagingMetalCheckRejection[]> = {}

    if (checkIds.length > 0) {
      const { data: rejectionsData } = await supabase
        .from('process_packaging_metal_check_rejections')
        .select('*')
        .in('metal_check_id', checkIds)
        .order('created_at', { ascending: true })

      const rejections = (rejectionsData as ProcessPackagingMetalCheckRejection[]) || []
      rejectionsByCheckId = rejections.reduce<Record<number, ProcessPackagingMetalCheckRejection[]>>((acc, rejection) => {
        const list = acc[rejection.metal_check_id] || []
        list.push(rejection)
        acc[rejection.metal_check_id] = list
        return acc
      }, {})
    }

    const bySortingOutput = checks.reduce<Record<number, ProcessPackagingMetalCheck[]>>((acc, check) => {
      const withRejections: ProcessPackagingMetalCheck = {
        ...check,
        rejections: rejectionsByCheckId[check.id] || [],
      }
      const list = acc[check.sorting_output_id] || []
      list.push(withRejections)
      acc[check.sorting_output_id] = list
      return acc
    }, {})

    setMetalChecksBySortingOutput(bySortingOutput)
  }, [])

  const fetchData = useCallback(async () => {
    if (!stepRunId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data: runData, error: runError } = await supabase
      .from('process_packaging_runs')
      .select('*')
      .eq('process_step_run_id', stepRunId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (runError && runError.code !== 'PGRST116') {
      setError(runError)
      setPackagingRun(null)
      setPackEntries([])
      setMetalChecksBySortingOutput({})
      setWeightChecks([])
      setPhotos([])
      setWaste([])
      setLoading(false)
      return
    }

    setPackagingRun((runData as ProcessPackagingRun) || null)

    if (runData) {
      const { data: packEntriesData, error: packEntriesError } = await supabase
        .from('process_packaging_pack_entries')
        .select('*')
        .eq('packaging_run_id', runData.id)
        .order('created_at', { ascending: false })

      if (packEntriesError) {
        setPackEntries([])
      } else {
        setPackEntries((packEntriesData as ProcessPackagingPackEntry[]) || [])
      }

      await fetchMetalChecks(runData.id)

      const { data: checksData, error: checksError } = await supabase
        .from('process_packaging_weight_checks')
        .select('*')
        .eq('packaging_run_id', runData.id)
        .order('check_no', { ascending: true })

      if (checksError) {
        setError(checksError)
        setWeightChecks([])
      } else {
        setWeightChecks((checksData as ProcessPackagingWeightCheck[]) || [])
      }

      const { data: photosData, error: photosError } = await supabase
        .from('process_packaging_photos')
        .select('*')
        .eq('packaging_run_id', runData.id)
        .order('created_at', { ascending: false })

      if (photosError) {
        setError(photosError)
        setPhotos([])
      } else {
        setPhotos((photosData as ProcessPackagingPhoto[]) || [])
      }

      const { data: wasteData, error: wasteError } = await supabase
        .from('process_packaging_waste')
        .select('*')
        .eq('packaging_run_id', runData.id)
        .order('created_at', { ascending: false })

      if (wasteError) {
        setError(wasteError)
        setWaste([])
      } else {
        setWaste((wasteData as ProcessPackagingWaste[]) || [])
      }
    } else {
      setPackEntries([])
      setMetalChecksBySortingOutput({})
      setWeightChecks([])
      setPhotos([])
      setWaste([])
    }

    setLoading(false)
  }, [stepRunId, enabled, fetchMetalChecks])

  const refreshMetalChecks = useCallback(async () => {
    if (!packagingRun?.id) {
      setMetalChecksBySortingOutput({})
      return
    }
    await fetchMetalChecks(packagingRun.id)
  }, [packagingRun?.id, fetchMetalChecks])

  const getLatestMetalCheck = useCallback(
    (sortingOutputId: number): ProcessPackagingMetalCheck | null => {
      const checks = metalChecksBySortingOutput[sortingOutputId] || []
      if (checks.length === 0) return null
      return checks.reduce((latest, current) => {
        if (!latest) return current
        return current.attempt_no > latest.attempt_no ? current : latest
      }, checks[0])
    },
    [metalChecksBySortingOutput]
  )

  const getFailedRejectedWeightBySortingOutput = useCallback(
    (sortingOutputId: number): number => {
      const checks = metalChecksBySortingOutput[sortingOutputId] || []
      return checks.reduce((sum, check) => {
        if (check.status !== 'FAIL') return sum
        const rejected = (check.rejections || []).reduce((acc, row) => acc + (Number(row.weight_kg) || 0), 0)
        return sum + rejected
      }, 0)
    },
    [metalChecksBySortingOutput]
  )

  const savePackagingRun = useCallback(
    async (data: Partial<ProcessPackagingRun>) => {
      if (!stepRunId) {
        throw new Error('Step run ID is required')
      }

      const { id, created_at, updated_at, process_step_run_id, ...updateData } = data

      let runId = packagingRun?.id
      if (!runId) {
        const { data: existingRun } = await supabase
          .from('process_packaging_runs')
          .select('*')
          .eq('process_step_run_id', stepRunId)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (existingRun) {
          const run = existingRun as ProcessPackagingRun
          runId = run.id
          setPackagingRun(run)
        } else {
          runId = null
        }
      }

      if (runId) {
        const { data: updatedRun, error: updateError } = await supabase
          .from('process_packaging_runs')
          .update(updateData)
          .eq('id', runId)
          .select('*')
          .single()
        if (updateError) throw updateError
        if (updatedRun) {
          setPackagingRun(updatedRun as ProcessPackagingRun)
        }
      } else {
        const { data: insertedRun, error: insertError } = await supabase
          .from('process_packaging_runs')
          .insert({
            process_step_run_id: stepRunId,
            ...updateData,
          })
          .select('*')
          .single()
        if (insertError) throw insertError
        if (insertedRun) {
          setPackagingRun(insertedRun as ProcessPackagingRun)
        }
      }
    },
    [stepRunId, packagingRun]
  )

  const addWeightCheck = useCallback(
    async (check: { check_no: number; weight_kg: number }) => {
      if (!packagingRun) {
        throw new Error('Packaging run must be created before adding weight checks')
      }

      const { error: insertError } = await supabase
        .from('process_packaging_weight_checks')
        .insert({
          packaging_run_id: packagingRun.id,
          ...check,
        })

      if (insertError) throw insertError
      await fetchData()
    },
    [packagingRun, fetchData]
  )

  const updateWeightCheck = useCallback(
    async (checkId: number, data: { check_no?: number; weight_kg?: number }) => {
      const { error: updateError } = await supabase
        .from('process_packaging_weight_checks')
        .update(data)
        .eq('id', checkId)

      if (updateError) throw updateError
      await fetchData()
    },
    [fetchData]
  )

  const deleteWeightCheck = useCallback(
    async (checkId: number) => {
      const { error: deleteError } = await supabase
        .from('process_packaging_weight_checks')
        .delete()
        .eq('id', checkId)

      if (deleteError) throw deleteError
      await fetchData()
    },
    [fetchData]
  )

  const addPhoto = useCallback(
    async (photo: { photo_type: 'product' | 'label' | 'pallet'; file_path: string }) => {
      if (!packagingRun) {
        throw new Error('Packaging run must be created before adding photos')
      }

      const { error: insertError } = await supabase
        .from('process_packaging_photos')
        .insert({
          packaging_run_id: packagingRun.id,
          ...photo,
        })

      if (insertError) throw insertError
      await fetchData()
    },
    [packagingRun, fetchData]
  )

  const deletePhoto = useCallback(
    async (photoId: number) => {
      const { error: deleteError } = await supabase
        .from('process_packaging_photos')
        .delete()
        .eq('id', photoId)

      if (deleteError) throw deleteError
      await fetchData()
    },
    [fetchData]
  )

  const addWaste = useCallback(
    async (wasteData: { waste_type: string; quantity_kg: number }) => {
      if (!packagingRun) {
        throw new Error('Packaging run must be created before adding waste')
      }

      const { error: insertError } = await supabase
        .from('process_packaging_waste')
        .insert({
          packaging_run_id: packagingRun.id,
          ...wasteData,
        })

      if (insertError) throw insertError
      await fetchData()
    },
    [packagingRun, fetchData]
  )

  const deleteWaste = useCallback(
    async (wasteId: number) => {
      const { error: deleteError } = await supabase
        .from('process_packaging_waste')
        .delete()
        .eq('id', wasteId)

      if (deleteError) throw deleteError
      await fetchData()
    },
    [fetchData]
  )

  const addMetalCheckAttempt = useCallback(
    async (input: AddMetalCheckAttemptInput) => {
      if (!packagingRun) {
        throw new Error('Packaging run must be created before recording metal checks')
      }
      if (input.status === 'FAIL' && (!input.rejections || input.rejections.length === 0)) {
        throw new Error('At least one foreign-object rejection is required for FAIL status')
      }

      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id ?? null

      const { data: attemptsData, error: attemptsError } = await supabase
        .from('process_packaging_metal_checks')
        .select('attempt_no')
        .eq('packaging_run_id', packagingRun.id)
        .eq('sorting_output_id', input.sorting_output_id)
        .order('attempt_no', { ascending: false })
        .limit(1)

      if (attemptsError) throw attemptsError
      const nextAttemptNo = ((attemptsData?.[0]?.attempt_no as number | undefined) || 0) + 1

      const { data: insertedCheck, error: checkError } = await supabase
        .from('process_packaging_metal_checks')
        .insert({
          packaging_run_id: packagingRun.id,
          sorting_output_id: input.sorting_output_id,
          attempt_no: nextAttemptNo,
          status: input.status,
          remarks: input.remarks?.trim() || null,
          checked_by: userId,
          checked_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (checkError || !insertedCheck) throw checkError || new Error('Failed to save metal-check attempt')

      if (input.status === 'FAIL' && input.rejections?.length) {
        const rejectionRows = input.rejections.map((row) => ({
          metal_check_id: insertedCheck.id,
          object_type: row.object_type.trim(),
          weight_kg: row.weight_kg,
          corrective_action: row.corrective_action?.trim() || null,
          created_by: userId,
        }))
        const { error: rejectionError } = await supabase
          .from('process_packaging_metal_check_rejections')
          .insert(rejectionRows)

        if (rejectionError) throw rejectionError
      }

      await fetchData()
    },
    [packagingRun, fetchData]
  )

  const addPackEntry = useCallback(
    async (data: {
      sorting_output_id: number
      product_id: number | null
      pack_identifier: string
      quantity_kg: number
      packing_type: string | null
      pack_size_kg?: number | null
    }) => {
      if (!packagingRun) {
        throw new Error('Packaging run must be created before adding pack entries')
      }

      const latestCheck = getLatestMetalCheck(data.sorting_output_id)
      if (!latestCheck || latestCheck.status !== 'PASS') {
        throw new Error('Metal detection must pass before packing this sorted output.')
      }

      const attempts = metalChecksBySortingOutput[data.sorting_output_id]?.length || 0

      const { error: insertError } = await supabase
        .from('process_packaging_pack_entries')
        .insert({
          packaging_run_id: packagingRun.id,
          sorting_output_id: data.sorting_output_id,
          product_id: data.product_id ?? null,
          pack_identifier: data.pack_identifier,
          quantity_kg: data.quantity_kg,
          packing_type: data.packing_type ?? null,
          pack_size_kg: data.pack_size_kg ?? null,
          metal_check_status: latestCheck.status,
          metal_check_attempts: attempts,
          metal_check_last_id: latestCheck.id,
          metal_check_last_checked_at: latestCheck.checked_at,
          metal_check_last_checked_by: latestCheck.checked_by,
        })

      if (insertError) throw insertError
      await fetchData()
    },
    [packagingRun, fetchData, getLatestMetalCheck, metalChecksBySortingOutput]
  )

  const deletePackEntry = useCallback(
    async (id: number) => {
      const { error: deleteError } = await supabase
        .from('process_packaging_pack_entries')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      await fetchData()
    },
    [fetchData]
  )

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    packagingRun,
    packEntries,
    metalChecksBySortingOutput,
    getLatestMetalCheck,
    getFailedRejectedWeightBySortingOutput,
    refreshMetalChecks,
    addMetalCheckAttempt,
    weightChecks,
    photos,
    waste,
    loading,
    error,
    refresh: fetchData,
    savePackagingRun,
    addWeightCheck,
    updateWeightCheck,
    deleteWeightCheck,
    addPhoto,
    deletePhoto,
    addWaste,
    deleteWaste,
    addPackEntry,
    deletePackEntry,
  }
}
