import { useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  hasStagePermission,
  type PermissionKey,
  type StageAction,
  type WorkflowStage,
} from '@/lib/rbac'

export function usePermissions() {
  const { accessContext, accessLoading } = useAuth()

  const permissions = useMemo(() => new Set(accessContext?.permissions ?? []), [accessContext])

  return {
    accessContext,
    accessLoading,
    permissions,
    can: (permission: PermissionKey) => hasPermission(accessContext, permission),
    canAny: (permissionKeys: PermissionKey[]) => hasAnyPermission(accessContext, permissionKeys),
    canAll: (permissionKeys: PermissionKey[]) => hasAllPermissions(accessContext, permissionKeys),
    canStage: (stage: WorkflowStage, action: StageAction) => hasStagePermission(accessContext, stage, action),
  }
}

