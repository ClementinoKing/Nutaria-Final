export interface RoleOption {
  value: string
  label: string
  description: string
  capabilities: string[]
  permissions: string[]
}

export interface RoleCapabilityMatrix {
  area: string
  description: string
  access: {
    'Super Admin': string
    Admin: string
    'Production Administrator': string
    'Production Manager': string
    Operator: string
  }
}

export const ROLE_OPTIONS: RoleOption[] = [
  {
    value: 'Super Admin',
    label: 'Super Admin',
    description: 'Full system-wide access, including users, roles, permissions, settings, and audit logs.',
    capabilities: ['Global Access', 'Identity', 'Audit', 'Configuration'],
    permissions: [
      'users.manage',
      'users.reset_password',
      'workflow.supply.create',
      'workflow.supply.edit',
      'workflow.shipment.create',
      'workflow.shipment.edit',
      'workflow.checklist.manage',
      'workflow.approve',
      'reports.view',
      'dashboards.view',
      'settings.manage',
      'audit_logs.view'
    ]
  },
  {
    value: 'Admin',
    label: 'Admin',
    description: 'Full access within the platform, including users, workflow data, reports, and access administration.',
    capabilities: ['Platform Admin', 'Identity', 'Workflow'],
    permissions: [
      'users.manage',
      'users.reset_password',
      'workflow.supply.create',
      'workflow.supply.edit',
      'workflow.shipment.create',
      'workflow.shipment.edit',
      'workflow.checklist.manage',
      'workflow.approve',
      'reports.view',
      'dashboards.view',
      'settings.manage',
      'audit_logs.view'
    ]
  },
  {
    value: 'Production Administrator',
    label: 'Production Administrator',
    description: 'Capture and edit supply, shipment, and checklist data with reporting access.',
    capabilities: ['Supply', 'Shipment', 'Checklist', 'Reporting'],
    permissions: [
      'workflow.supply.create',
      'workflow.supply.edit',
      'workflow.shipment.create',
      'workflow.shipment.edit',
      'workflow.checklist.manage',
      'reports.view',
      'dashboards.view',
      'audit_logs.view'
    ]
  },
  {
    value: 'Production Manager',
    label: 'Production Manager',
    description: 'Operational control plus approvals, dashboards, and reports.',
    capabilities: ['Supply', 'Shipment', 'Checklist', 'Approvals', 'Reporting'],
    permissions: [
      'workflow.supply.create',
      'workflow.supply.edit',
      'workflow.shipment.create',
      'workflow.shipment.edit',
      'workflow.checklist.manage',
      'workflow.approve',
      'reports.view',
      'dashboards.view',
      'audit_logs.view'
    ]
  },
  {
    value: 'Operator',
    label: 'Operator',
    description: 'Data capture for supply, shipment, and checklist workflows without approvals or admin access.',
    capabilities: ['Supply Capture', 'Shipment Capture', 'Checklist'],
    permissions: [
      'workflow.supply.create',
      'workflow.supply.edit',
      'workflow.shipment.create',
      'workflow.shipment.edit',
      'workflow.checklist.manage'
    ]
  }
]

export const ROLE_CAPABILITY_MATRIX: RoleCapabilityMatrix[] = [
  {
    area: 'User & Access Admin',
    description: 'Users, roles, permissions, and security settings',
    access: {
      'Super Admin': 'Full',
      Admin: 'Full',
      'Production Administrator': 'None',
      'Production Manager': 'None',
      Operator: 'None'
    }
  },
  {
    area: 'Supply Workflow',
    description: 'Supply capture, edits, and operational handling',
    access: {
      'Super Admin': 'Full',
      Admin: 'Full',
      'Production Administrator': 'Full',
      'Production Manager': 'Full',
      Operator: 'Capture'
    }
  },
  {
    area: 'Shipment Workflow',
    description: 'Shipment capture, edits, and fulfillment handling',
    access: {
      'Super Admin': 'Full',
      Admin: 'Full',
      'Production Administrator': 'Full',
      'Production Manager': 'Full',
      Operator: 'Capture'
    }
  },
  {
    area: 'Checklist & QA',
    description: 'Checklist records and production validation',
    access: {
      'Super Admin': 'Full',
      Admin: 'Full',
      'Production Administrator': 'Full',
      'Production Manager': 'Full',
      Operator: 'Capture'
    }
  },
  {
    area: 'Approvals',
    description: 'Workflow approval and validation steps',
    access: {
      'Super Admin': 'Full',
      Admin: 'Full',
      'Production Administrator': 'None',
      'Production Manager': 'Full',
      Operator: 'None'
    }
  },
  {
    area: 'Reports & Dashboards',
    description: 'Dashboards, KPIs, and operational reports',
    access: {
      'Super Admin': 'Full',
      Admin: 'Full',
      'Production Administrator': 'View',
      'Production Manager': 'Full',
      Operator: 'None'
    }
  }
]

export function normalizeRoleName(role: string | null | undefined): string | null {
  if (!role) return null
  const normalized = role.trim().toLowerCase()
  switch (normalized) {
    case 'super admin':
      return 'Super Admin'
    case 'admin':
      return 'Admin'
    case 'production administrator':
      return 'Production Administrator'
    case 'production manager':
      return 'Production Manager'
    case 'operator':
      return 'Operator'
    case 'planner':
      return 'Production Administrator'
    case 'qa':
      return 'Production Manager'
    case 'viewer':
      return 'Operator'
    default:
      return role
  }
}

export function getRoleOption(role: string | null | undefined): RoleOption | undefined {
  const normalized = normalizeRoleName(role)
  return ROLE_OPTIONS.find((option) => option.value === normalized)
}
