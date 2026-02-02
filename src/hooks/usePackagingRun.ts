import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type {
  ProcessPackagingRun,
  ProcessPackagingWeightCheck,
  ProcessPackagingPhoto,
  ProcessPackagingWaste,
} from '@/types/processExecution'

interface UsePackagingRunOptions {
  stepRunId: number | null
  enabled?: boolean
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
  packEntries: Array<{ id: number; packaging_run_id: number; sorting_output_id: number; product_id: number | null; pack_identifier: string; quantity_kg: number; packing_type: string | null }>
  addPackEntry: (data: { sorting_output_id: number; product_id: number | null; pack_identifier: string; quantity_kg: number; packing_type: string | null }) => Promise<void>
  deletePackEntry: (id: number) => Promise<void>
}

export function usePackagingRun(options: UsePackagingRunOptions): UsePackagingRunReturn {
  const { stepRunId, enabled = true } = options
  const [packagingRun, setPackagingRun] = useState<ProcessPackagingRun | null>(null)
  const [packEntries, setPackEntries] = useState<Array<{ id: number; packaging_run_id: number; sorting_output_id: number; product_id: number | null; pack_identifier: string; quantity_kg: number; packing_type: string | null }>>([])
  const [weightChecks, setWeightChecks] = useState<ProcessPackagingWeightCheck[]>([])
  const [photos, setPhotos] = useState<ProcessPackagingPhoto[]>([])
  const [waste, setWaste] = useState<ProcessPackagingWaste[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchData = useCallback(async () => {
    if (!stepRunId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Fetch packaging run
    const { data: runData, error: runError } = await supabase
      .from('process_packaging_runs')
      .select('*')
      .eq('process_step_run_id', stepRunId)
      .maybeSingle()

    if (runError && runError.code !== 'PGRST116') {
      setError(runError)
      setPackagingRun(null)
    } else {
      setPackagingRun((runData as ProcessPackagingRun) || null)

      // Fetch related data if run exists
      if (runData) {
        // Fetch pack entries
        const { data: packEntriesData, error: packEntriesError } = await supabase
          .from('process_packaging_pack_entries')
          .select('*')
          .eq('packaging_run_id', runData.id)
          .order('created_at', { ascending: false })

        if (packEntriesError) {
          setPackEntries([])
        } else {
          setPackEntries((packEntriesData as Array<{ id: number; packaging_run_id: number; sorting_output_id: number; product_id: number | null; pack_identifier: string; quantity_kg: number; packing_type: string | null }>) || [])
        }

        // Fetch weight checks
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

        // Fetch photos
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

        // Fetch waste
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
        setWeightChecks([])
        setPhotos([])
        setWaste([])
      }
    }

    setLoading(false)
  }, [stepRunId, enabled])

  const savePackagingRun = useCallback(
    async (data: Partial<ProcessPackagingRun>) => {
      if (!stepRunId) {
        throw new Error('Step run ID is required')
      }

      // Remove id and timestamps from update data
      const { id, created_at, updated_at, process_step_run_id, ...updateData } = data

      if (packagingRun) {
        // Update existing
        const { error: updateError } = await supabase
          .from('process_packaging_runs')
          .update(updateData)
          .eq('id', packagingRun.id)

        if (updateError) {
          throw updateError
        }
      } else {
        // Create new
        const { error: insertError } = await supabase
          .from('process_packaging_runs')
          .insert({
            process_step_run_id: stepRunId,
            ...updateData,
          })

        if (insertError) {
          throw insertError
        }
      }

      await fetchData()
    },
    [stepRunId, packagingRun, fetchData]
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

      if (insertError) {
        throw insertError
      }

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

      if (updateError) {
        throw updateError
      }

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

      if (deleteError) {
        throw deleteError
      }

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

      if (insertError) {
        throw insertError
      }

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

      if (deleteError) {
        throw deleteError
      }

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

      if (insertError) {
        throw insertError
      }

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

      if (deleteError) {
        throw deleteError
      }

      await fetchData()
    },
    [fetchData]
  )

  const addPackEntry = useCallback(
    async (data: { sorting_output_id: number; product_id: number | null; pack_identifier: string; quantity_kg: number; packing_type: string | null }) => {
      if (!packagingRun) {
        throw new Error('Packaging run must be created before adding pack entries')
      }

      const { error: insertError } = await supabase
        .from('process_packaging_pack_entries')
        .insert({
          packaging_run_id: packagingRun.id,
          sorting_output_id: data.sorting_output_id,
          product_id: data.product_id ?? null,
          pack_identifier: data.pack_identifier,
          quantity_kg: data.quantity_kg,
          packing_type: data.packing_type ?? null,
        })

      if (insertError) {
        throw insertError
      }

      await fetchData()
    },
    [packagingRun, fetchData]
  )

  const deletePackEntry = useCallback(
    async (id: number) => {
      const { error: deleteError } = await supabase
        .from('process_packaging_pack_entries')
        .delete()
        .eq('id', id)

      if (deleteError) {
        throw deleteError
      }

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
