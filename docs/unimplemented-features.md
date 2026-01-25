# Unimplemented Features Analysis

This document lists database tables and features that exist in the schema but are not yet fully implemented in the application UI.

## Fully Unimplemented Features

### 1. **Carriers Management** 🚚
- **Table**: `carriers`
- **Status**: Referenced in shipments but no management page
- **Schema Fields**:
  - `id`, `name` (unique), `contact_name`, `phone`, `email`, `created_at`
- **What's Missing**:
  - Carrier list/management page
  - Add/Edit/Delete carriers
  - Carrier selection dropdown in shipments (currently using free text)
- **Where Referenced**: Shipments page shows `carrier_name` and `carrier_reference` but no carrier management

### 2. **Cycle Counts** 📊
- **Tables**: `cycle_counts`, `cycle_count_lines`
- **Status**: Referenced but not implemented
- **Schema Fields**:
  - `cycle_counts`: `id`, `warehouse_id`, `scheduled_for`, `status` (SCHEDULED/IN_PROGRESS/COMPLETED/CANCELLED)
  - `cycle_count_lines`: `id`, `cycle_count_id`, `product_id`, `lot_id`, `counted_qty`, `variance_qty`, `unit_id`, `notes`
- **What's Missing**:
  - Cycle count scheduling page
  - Cycle count execution page
  - Cycle count line items entry
  - Variance reporting
- **Where Referenced**: StockLevels shows `cycle_count_due_at` field but no cycle count management

### 3. **Inventory Adjustments** 🔧
- **Table**: `inventory_adjustments`
- **Status**: Not implemented
- **Schema Fields**:
  - `id`, `product_id`, `warehouse_id`, `lot_id`, `reason`, `qty`, `unit_id`, `note`, `adjusted_by`, `adjusted_at`
- **What's Missing**:
  - Inventory adjustments page
  - Create adjustment form
  - Adjustment history/reporting
  - Reason code management
- **Impact**: No way to adjust inventory quantities (for corrections, write-offs, etc.)

### 4. **Quality Parameters Management** 📋
- **Table**: `quality_parameters`
- **Status**: Used in supplies but no management page
- **Schema Fields**:
  - `id`, `code` (unique), `name`, `specification`, `created_at`, `updated_at`
- **What's Missing**:
  - Quality parameters list/management page
  - Add/Edit/Delete quality parameters
  - Currently uses hardcoded constants from `constants/supplyQuality.ts`
- **Where Referenced**: Supplies page uses quality parameters but they're not editable in UI

### 5. **Product-Process Associations** 🔗
- **Table**: `product_processes`
- **Status**: Backend exists but no UI for management
- **Schema Fields**:
  - `id`, `product_id`, `process_id`, `is_default`, `effective_from`, `effective_to`, `created_at`, `updated_at`
- **What's Missing**:
  - UI to link products to processes
  - Set default process for a product
  - Effective date range management
- **Where Referenced**: Processes page has some backend code but no UI

### 6. **Activity Logs** 📝
- **Tables**: `shipment_activities`, `supply_activities`
- **Status**: Not displayed in UI
- **Schema Fields**:
  - Both: `id`, `shipment_id`/`supply_id`, `type`, `description`, `actor`, `timestamp`
- **What's Missing**:
  - Activity timeline in shipment detail
  - Activity timeline in supply detail
  - Activity log display component
- **Impact**: Users can't see history of actions taken on shipments/supplies

### 7. **Document Management** 📄
- **Table**: `documents`
- **Status**: Used for suppliers but no general management
- **Schema Fields**:
  - `id`, `owner_type` (supply/shipment/supplier), `owner_id`, `name`, `doc_type`, `storage_path`, `uploaded_by`, `uploaded_at`, `expiry_date`
- **What's Missing**:
  - Document upload/management for supplies (only suppliers have it)
  - Document management page
  - Document expiry tracking/alerts
  - Document type management
- **Where Implemented**: Supplier page has document upload, shipments show documents but no upload

### 8. **Shipment Lot Allocations** 📦
- **Table**: `shipment_lot_allocations`
- **Status**: Not implemented
- **Schema Fields**:
  - `id`, `shipment_item_id`, `lot_id`, `allocated_qty`, `created_at`
- **What's Missing**:
  - Lot allocation UI in shipment items
  - Track which specific lots are allocated to which shipment items
  - Lot selection during shipment creation
- **Impact**: Can't track lot-level allocation to shipments (FIFO/LIFO management)

### 9. **Supply Lines** 📋
- **Table**: `supply_lines`
- **Status**: May be partially implemented (need to verify)
- **Schema Fields**:
  - `id`, `supply_id`, `product_id`, `unit_id`, `ordered_qty`, `received_qty`, `accepted_qty`, `rejected_qty`, `variance_reason`
- **What to Check**: Verify if supply lines are fully managed in Supplies page or just batches

## Partially Implemented Features

### 1. **Customer Contacts** ✅
- **Table**: `customer_contacts`
- **Status**: ✅ IMPLEMENTED in Customers page
- **Note**: Fully functional - can add/edit/delete contacts within customer management

### 2. **Shipment Items** ✅
- **Table**: `shipment_items`
- **Status**: ✅ IMPLEMENTED in Shipments page
- **Note**: Can add items to shipments

### 3. **Supply Batches** ✅
- **Table**: `supply_batches`
- **Status**: ✅ IMPLEMENTED in Supplies page
- **Note**: Full batch management available

### 4. **Process Steps** ✅
- **Table**: `process_steps`
- **Status**: ✅ IMPLEMENTED in Process pages
- **Note**: Process steps can be managed

### 5. **Stock Levels** ✅
- **Table**: `stock_levels`
- **Status**: ✅ IMPLEMENTED in StockLevels page
- **Note**: Shows on-hand, allocated, quality_hold, in_transit quantities

### 6. **Supply Quality Checks** ✅
- **Table**: `supply_quality_checks`, `supply_quality_check_items`
- **Status**: ✅ IMPLEMENTED in Supplies page
- **Note**: Full quality check workflow available

### 7. **Inventory Movements** ✅
- **Table**: `inventory_movements`
- **Status**: ✅ IMPLEMENTED in StockMovements page
- **Note**: Shows movement history

## Implementation Priority Recommendations

### High Priority 🚨
1. **Inventory Adjustments** - Critical for inventory accuracy
2. **Cycle Counts** - Essential for inventory control
3. **Carriers Management** - Needed for proper shipment tracking

### Medium Priority ⚠️
4. **Quality Parameters Management** - Currently hardcoded
5. **Activity Logs** - Important for audit trail
6. **Shipment Lot Allocations** - Needed for lot tracking

### Low Priority 💡
7. **Document Management** - Can enhance existing document features
8. **Product-Process Associations** - Nice to have for better workflow

## Notes

- All core CRUD operations are implemented for main entities (Products, Suppliers, Customers, Supplies, Shipments, etc.)
- The system has good foundation with audit logging now in place
- Most missing features are enhancement/operational features rather than core functionality
- Consider implementing features based on business priority and user feedback




