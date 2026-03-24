export const PERMISSIONS = {
  USERS_MANAGE: 'users.manage',
  USERS_RESET_PASSWORD: 'users.reset_password',
  WORKFLOW_SUPPLY_CREATE: 'workflow.supply.create',
  WORKFLOW_SUPPLY_EDIT: 'workflow.supply.edit',
  WORKFLOW_SHIPMENT_CREATE: 'workflow.shipment.create',
  WORKFLOW_SHIPMENT_EDIT: 'workflow.shipment.edit',
  WORKFLOW_CHECKLIST_MANAGE: 'workflow.checklist.manage',
  WORKFLOW_APPROVE: 'workflow.approve',
  REPORTS_VIEW: 'reports.view',
  DASHBOARDS_VIEW: 'dashboards.view',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_LOGS_VIEW: 'audit_logs.view',
  WORKFLOW_SUPPLY_VIEW: 'workflow.supply.view',
  WORKFLOW_SHIPMENT_VIEW: 'workflow.shipment.view',
  WORKFLOW_CHECKLIST_VIEW: 'workflow.checklist.view',
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const WORKFLOW_STAGES = ['supply', 'shipment', 'checklist'] as const
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number]

export const STAGE_ACTIONS = ['view', 'create', 'edit', 'manage', 'approve'] as const
export type StageAction = (typeof STAGE_ACTIONS)[number]

const STAGE_PERMISSION_MATRIX: Record<WorkflowStage, Record<Exclude<StageAction, 'view'>, PermissionKey>> = {
  supply: {
    create: PERMISSIONS.WORKFLOW_SUPPLY_CREATE,
    edit: PERMISSIONS.WORKFLOW_SUPPLY_EDIT,
    manage: PERMISSIONS.WORKFLOW_SUPPLY_EDIT,
    approve: PERMISSIONS.WORKFLOW_APPROVE,
  },
  shipment: {
    create: PERMISSIONS.WORKFLOW_SHIPMENT_CREATE,
    edit: PERMISSIONS.WORKFLOW_SHIPMENT_EDIT,
    manage: PERMISSIONS.WORKFLOW_SHIPMENT_EDIT,
    approve: PERMISSIONS.WORKFLOW_APPROVE,
  },
  checklist: {
    create: PERMISSIONS.WORKFLOW_CHECKLIST_MANAGE,
    edit: PERMISSIONS.WORKFLOW_CHECKLIST_MANAGE,
    manage: PERMISSIONS.WORKFLOW_CHECKLIST_MANAGE,
    approve: PERMISSIONS.WORKFLOW_APPROVE,
  },
}

export interface AccessRole {
  id: string
  name: string
}

export interface AccessContext {
  user_id: string
  legacy_role: string | null
  is_super_admin?: boolean
  roles: AccessRole[]
  permissions: PermissionKey[]
}

const ROLE_PERMISSION_FALLBACKS: Record<string, PermissionKey[]> = {
  'Super Admin': Object.values(PERMISSIONS),
  Admin: [
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.USERS_RESET_PASSWORD,
    PERMISSIONS.WORKFLOW_SUPPLY_CREATE,
    PERMISSIONS.WORKFLOW_SUPPLY_EDIT,
    PERMISSIONS.WORKFLOW_SHIPMENT_CREATE,
    PERMISSIONS.WORKFLOW_SHIPMENT_EDIT,
    PERMISSIONS.WORKFLOW_CHECKLIST_MANAGE,
    PERMISSIONS.WORKFLOW_APPROVE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.DASHBOARDS_VIEW,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.AUDIT_LOGS_VIEW,
    PERMISSIONS.WORKFLOW_SUPPLY_VIEW,
    PERMISSIONS.WORKFLOW_SHIPMENT_VIEW,
    PERMISSIONS.WORKFLOW_CHECKLIST_VIEW,
  ],
  'Production Administrator': [
    PERMISSIONS.WORKFLOW_SUPPLY_CREATE,
    PERMISSIONS.WORKFLOW_SUPPLY_EDIT,
    PERMISSIONS.WORKFLOW_SHIPMENT_CREATE,
    PERMISSIONS.WORKFLOW_SHIPMENT_EDIT,
    PERMISSIONS.WORKFLOW_CHECKLIST_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.DASHBOARDS_VIEW,
    PERMISSIONS.AUDIT_LOGS_VIEW,
    PERMISSIONS.WORKFLOW_SUPPLY_VIEW,
    PERMISSIONS.WORKFLOW_SHIPMENT_VIEW,
    PERMISSIONS.WORKFLOW_CHECKLIST_VIEW,
  ],
  'Production Manager': [
    PERMISSIONS.WORKFLOW_SUPPLY_CREATE,
    PERMISSIONS.WORKFLOW_SUPPLY_EDIT,
    PERMISSIONS.WORKFLOW_SHIPMENT_CREATE,
    PERMISSIONS.WORKFLOW_SHIPMENT_EDIT,
    PERMISSIONS.WORKFLOW_CHECKLIST_MANAGE,
    PERMISSIONS.WORKFLOW_APPROVE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.DASHBOARDS_VIEW,
    PERMISSIONS.AUDIT_LOGS_VIEW,
    PERMISSIONS.WORKFLOW_SUPPLY_VIEW,
    PERMISSIONS.WORKFLOW_SHIPMENT_VIEW,
    PERMISSIONS.WORKFLOW_CHECKLIST_VIEW,
  ],
  Operator: [
    PERMISSIONS.WORKFLOW_SUPPLY_CREATE,
    PERMISSIONS.WORKFLOW_SUPPLY_EDIT,
    PERMISSIONS.WORKFLOW_SHIPMENT_CREATE,
    PERMISSIONS.WORKFLOW_SHIPMENT_EDIT,
    PERMISSIONS.WORKFLOW_CHECKLIST_MANAGE,
    PERMISSIONS.WORKFLOW_SUPPLY_VIEW,
    PERMISSIONS.WORKFLOW_SHIPMENT_VIEW,
    PERMISSIONS.WORKFLOW_CHECKLIST_VIEW,
  ],
}

function getRolePermissionFallbacks(accessContext: AccessContext | null | undefined): PermissionKey[] {
  const roleNames = new Set<string>()

  if (accessContext?.legacy_role) {
    roleNames.add(accessContext.legacy_role)
  }

  for (const role of accessContext?.roles ?? []) {
    roleNames.add(role.name)
  }

  return Array.from(roleNames).flatMap((roleName) => ROLE_PERMISSION_FALLBACKS[roleName] ?? [])
}

function getEffectivePermissions(accessContext: AccessContext | null | undefined): Set<PermissionKey> {
  const effective = new Set<PermissionKey>(accessContext?.permissions ?? [])

  for (const permission of getRolePermissionFallbacks(accessContext)) {
    effective.add(permission)
  }

  return effective
}

function isSuperAdminAccess(accessContext: AccessContext | null | undefined): boolean {
  return Boolean(
    accessContext?.is_super_admin ||
      accessContext?.roles?.some((role) => role.name === 'Super Admin') ||
      accessContext?.legacy_role === 'Super Admin'
  )
}

export function hasPermission(
  accessContext: AccessContext | null | undefined,
  permission: PermissionKey
): boolean {
  return isSuperAdminAccess(accessContext) || getEffectivePermissions(accessContext).has(permission)
}

export function hasAnyPermission(
  accessContext: AccessContext | null | undefined,
  permissions: PermissionKey[]
): boolean {
  if (!permissions.length) {
    return true
  }
  return permissions.some((permission) => hasPermission(accessContext, permission))
}

export function hasAllPermissions(
  accessContext: AccessContext | null | undefined,
  permissions: PermissionKey[]
): boolean {
  if (!permissions.length) {
    return true
  }
  return permissions.every((permission) => hasPermission(accessContext, permission))
}

export function hasStagePermission(
  accessContext: AccessContext | null | undefined,
  stage: WorkflowStage,
  action: StageAction
): boolean {
  if (action === 'view') {
    return hasAnyPermission(accessContext, [
      STAGE_PERMISSION_MATRIX[stage].create,
      STAGE_PERMISSION_MATRIX[stage].edit,
      STAGE_PERMISSION_MATRIX[stage].manage,
      STAGE_PERMISSION_MATRIX[stage].approve,
    ])
  }

  return hasPermission(accessContext, STAGE_PERMISSION_MATRIX[stage][action])
}

export function stagePermissionKey(stage: WorkflowStage, action: Exclude<StageAction, 'view'>): PermissionKey {
  return STAGE_PERMISSION_MATRIX[stage][action]
}

export function permissionLabel(permission: PermissionKey): string {
  return permission
    .split('.')
    .map((segment) => segment.replace(/_/g, ' '))
    .join(' / ')
}
