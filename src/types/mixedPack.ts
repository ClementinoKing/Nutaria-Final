export interface MixedPackSourceOption {
  pack_entry_id: number
  product_id: number
  product_name: string
  product_sku: string | null
  pack_identifier: string | null
  lot_no: string | null
  lot_run_id: number | null
  remainder_kg: number
  used_remainder_kg: number
  available_remainder_kg: number
  quantity_kg: number
  pack_count: number | null
  packed_at: string | null
  warehouse_id: number
  warehouse_name: string | null
  unit_id: number | null
  unit_name: string | null
  unit_symbol: string | null
}

export interface MixedPackCreateLine {
  source_pack_entry_id: number
  quantity_used: string
  source: MixedPackSourceOption
}

export interface CreateMixedPackPayload {
  p_pack_name: string
  p_defined_pack_size: number | null
  p_warehouse_id: number | null
  p_unit_id: number | null
  p_require_exact_total: boolean
  p_packet_unit_code: string
  p_pack_identifier: string | null
  p_pack_size_kg: number
  p_packing_type: string | null
  p_storage_type: string
  p_box_unit_code: string | null
  p_units_count: number
  p_packs_per_unit: number
  p_notes: string | null
  p_lines: Array<{
    source_pack_entry_id: number
    quantity_used: number
  }>
}

export interface MixedPackBatchRow {
  id: number
  batch_no: string
  pack_name: string
  status: 'PACKAGED'
  inventory_type: 'mixed_pack'
  defined_pack_size: number | null
  actual_total_qty: number
  warehouse_id: number
  warehouse_name: string | null
  unit_id: number | null
  unit_label: string
  notes: string | null
  require_exact_total: boolean
  created_by_name: string
  created_at: string | null
  source_item_count: number
  packet_unit_code: string | null
  pack_size_kg: number | null
  packing_type: string | null
  storage_type: string | null
  box_unit_code: string | null
  units_count: number | null
  packs_per_unit: number | null
  total_packs: number | null
  storage_allocation_id: number | null
  pack_entry_id: number | null
}

export interface MixedPackBatchItemDetail {
  id: number
  source_allocation_id: number | null
  source_pack_entry_id: number | null
  source_product_id: number | null
  source_lot_run_id: number | null
  quantity_used: number
  product_name: string
  product_sku: string | null
  lot_no: string | null
  pack_identifier: string | null
  warehouse_name: string | null
}
