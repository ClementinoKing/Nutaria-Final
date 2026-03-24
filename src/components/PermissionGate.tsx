import type { ReactNode } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import type { PermissionKey, StageAction, WorkflowStage } from '@/lib/rbac'

interface PermissionGateProps {
  children: ReactNode
  fallback?: ReactNode
  permission?: PermissionKey
  anyOf?: PermissionKey[]
  allOf?: PermissionKey[]
  stage?: WorkflowStage
  action?: StageAction
}

export function PermissionGate({
  children,
  fallback = null,
  permission,
  anyOf,
  allOf,
  stage,
  action,
}: PermissionGateProps) {
  const { can, canAny, canAll, canStage } = usePermissions()

  const allowed = (() => {
    if (permission) {
      return can(permission)
    }
    if (stage && action) {
      return canStage(stage, action)
    }
    if (anyOf) {
      return canAny(anyOf)
    }
    if (allOf) {
      return canAll(allOf)
    }
    return true
  })()

  return allowed ? <>{children}</> : <>{fallback}</>
}

