import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export type UnitType = 'PACKET' | 'BOX'
export type PackagingType = 'DOY' | 'VACUUM' | 'POLY' | 'BOX'

export interface PackagingUnit {
  id: number
  code: string
  name: string
  unit_type: UnitType
  packaging_type: PackagingType | null
  net_weight_kg: number | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  is_active: boolean
  created_at: string | null
}

interface RelatedUnit {
  id: number
  code: string
  name: string
}

interface BoxPackRuleRow {
  id: number
  box_unit_id: number
  packet_unit_id: number
  packets_per_box: number
  is_active: boolean
  created_at: string | null
  box_unit_code: string | null
  box_unit_name: string | null
  packet_unit_code: string | null
  packet_unit_name: string | null
}

export interface BoxPackRule {
  id: number
  box_unit_id: number
  packet_unit_id: number
  packets_per_box: number
  is_active: boolean
  created_at: string | null
  box_unit: RelatedUnit | null
  packet_unit: RelatedUnit | null
}

export interface PackagingUnitInput {
  code: string
  name: string
  unit_type: UnitType
  packaging_type: PackagingType | null
  net_weight_kg: number | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
}

export interface BoxPackRuleInput {
  box_unit_id: number
  packet_unit_id: number
  packets_per_box: number
}

interface UsePackagingSettingsReturn {
  packagingUnits: PackagingUnit[]
  boxPackRules: BoxPackRule[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<{ error?: PostgrestError }>
  createUnit: (payload: PackagingUnitInput) => Promise<{ error?: PostgrestError }>
  updateUnit: (id: number, payload: PackagingUnitInput) => Promise<{ error?: PostgrestError }>
  toggleUnitActive: (id: number, isActive: boolean) => Promise<{ error?: PostgrestError }>
  createRule: (payload: BoxPackRuleInput) => Promise<{ error?: PostgrestError }>
  updateRule: (id: number, payload: BoxPackRuleInput) => Promise<{ error?: PostgrestError }>
  toggleRuleActive: (id: number, isActive: boolean) => Promise<{ error?: PostgrestError }>
  deleteRule: (id: number) => Promise<{ error?: PostgrestError }>
}

function mapRuleRow(row: BoxPackRuleRow): BoxPackRule {
  return {
    id: row.id,
    box_unit_id: row.box_unit_id,
    packet_unit_id: row.packet_unit_id,
    packets_per_box: row.packets_per_box,
    is_active: row.is_active,
    created_at: row.created_at,
    box_unit:
      row.box_unit_code || row.box_unit_name
        ? {
            id: row.box_unit_id,
            code: row.box_unit_code ?? String(row.box_unit_id),
            name: row.box_unit_name ?? '',
          }
        : null,
    packet_unit:
      row.packet_unit_code || row.packet_unit_name
        ? {
            id: row.packet_unit_id,
            code: row.packet_unit_code ?? String(row.packet_unit_id),
            name: row.packet_unit_name ?? '',
          }
        : null,
  }
}

export function usePackagingSettings(): UsePackagingSettingsReturn {
  const [packagingUnits, setPackagingUnits] = useState<PackagingUnit[]>([])
  const [boxPackRules, setBoxPackRules] = useState<BoxPackRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [unitsResult, rulesResult] = await Promise.all([
      supabase.rpc('get_packaging_units'),
      supabase.rpc('get_box_pack_rules'),
    ])

    if (unitsResult.error) {
      setError(unitsResult.error)
      setLoading(false)
      return { error: unitsResult.error }
    }

    if (rulesResult.error) {
      setError(rulesResult.error)
      setLoading(false)
      return { error: rulesResult.error }
    }

    setPackagingUnits((unitsResult.data ?? []) as PackagingUnit[])
    setBoxPackRules(((rulesResult.data ?? []) as BoxPackRuleRow[]).map(mapRuleRow))
    setLoading(false)
    return {}
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const createUnit = useCallback(
    async (payload: PackagingUnitInput) => {
      const { error: createError } = await supabase.rpc('upsert_packaging_unit', {
        p_id: null,
        p_code: payload.code,
        p_name: payload.name,
        p_unit_type: payload.unit_type,
        p_packaging_type: payload.packaging_type,
        p_net_weight_kg: payload.net_weight_kg,
        p_length_mm: payload.length_mm,
        p_width_mm: payload.width_mm,
        p_height_mm: payload.height_mm,
      })
      if (createError) return { error: createError }
      return fetchAll()
    },
    [fetchAll]
  )

  const updateUnit = useCallback(
    async (id: number, payload: PackagingUnitInput) => {
      const { error: updateError } = await supabase.rpc('upsert_packaging_unit', {
        p_id: id,
        p_code: payload.code,
        p_name: payload.name,
        p_unit_type: payload.unit_type,
        p_packaging_type: payload.packaging_type,
        p_net_weight_kg: payload.net_weight_kg,
        p_length_mm: payload.length_mm,
        p_width_mm: payload.width_mm,
        p_height_mm: payload.height_mm,
      })
      if (updateError) return { error: updateError }
      return fetchAll()
    },
    [fetchAll]
  )

  const toggleUnitActive = useCallback(
    async (id: number, isActive: boolean) => {
      const { error: updateError } = await supabase.rpc('set_packaging_unit_active', {
        p_id: id,
        p_is_active: isActive,
      })
      if (updateError) return { error: updateError }
      return fetchAll()
    },
    [fetchAll]
  )

  const createRule = useCallback(
    async (payload: BoxPackRuleInput) => {
      const { error: createError } = await supabase.rpc('upsert_box_pack_rule', {
        p_id: null,
        p_box_unit_id: payload.box_unit_id,
        p_packet_unit_id: payload.packet_unit_id,
        p_packets_per_box: payload.packets_per_box,
      })
      if (createError) return { error: createError }
      return fetchAll()
    },
    [fetchAll]
  )

  const updateRule = useCallback(
    async (id: number, payload: BoxPackRuleInput) => {
      const { error: updateError } = await supabase.rpc('upsert_box_pack_rule', {
        p_id: id,
        p_box_unit_id: payload.box_unit_id,
        p_packet_unit_id: payload.packet_unit_id,
        p_packets_per_box: payload.packets_per_box,
      })
      if (updateError) return { error: updateError }
      return fetchAll()
    },
    [fetchAll]
  )

  const toggleRuleActive = useCallback(
    async (id: number, isActive: boolean) => {
      const { error: updateError } = await supabase.rpc('set_box_pack_rule_active', {
        p_id: id,
        p_is_active: isActive,
      })
      if (updateError) return { error: updateError }
      return fetchAll()
    },
    [fetchAll]
  )

  const deleteRule = useCallback(
    async (id: number) => {
      const { error: deleteError } = await supabase.rpc('delete_box_pack_rule', {
        p_id: id,
      })
      if (deleteError) return { error: deleteError }
      return fetchAll()
    },
    [fetchAll]
  )

  return {
    packagingUnits,
    boxPackRules,
    loading,
    error,
    refresh: fetchAll,
    createUnit,
    updateUnit,
    toggleUnitActive,
    createRule,
    updateRule,
    toggleRuleActive,
    deleteRule,
  }
}
