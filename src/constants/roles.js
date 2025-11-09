export const ROLE_OPTIONS = [
  {
    value: 'admin',
    label: 'Administrator',
    description: 'Full access across governance, configuration, user management, and auditing.',
    capabilities: ['Governance', 'Security', 'Configuration'],
    permissions: [
      'Manage users and roles',
      'Configure inventory settings',
      'View and edit all operational data',
      'Approve access reviews'
    ]
  },
  {
    value: 'planner',
    label: 'Production Planner',
    description: 'Oversees day-to-day inventory, production planning, and fulfilment workflows.',
    capabilities: ['Supply Chain', 'Production', 'Fulfilment'],
    permissions: [
      'Manage supplies and shipments',
      'Update production schedules',
      'Coordinate supplier allocations'
    ]
  },
  {
    value: 'qa',
    label: 'Quality Assurance',
    description: 'Focused access to quality, grading, and compliance records.',
    capabilities: ['Quality', 'Compliance'],
    permissions: ['Log grading events', 'Audit quality checks', 'Export compliance reports']
  },
  {
    value: 'viewer',
    label: 'Viewer',
    description: 'Read-only visibility into core operational dashboards and records.',
    capabilities: ['Analytics', 'Reporting'],
    permissions: ['View inventory dashboards', 'Export summary reports']
  }
]

export const ROLE_CAPABILITY_MATRIX = [
  {
    area: 'Inventory & Stock',
    description: 'Units, warehouses, and product catalogues',
    access: {
      admin: 'Full',
      planner: 'Full',
      qa: 'View',
      viewer: 'View'
    }
  },
  {
    area: 'Process & Production',
    description: 'Batch events, process analytics, line status',
    access: {
      admin: 'Full',
      planner: 'Full',
      qa: 'Edit',
      viewer: 'View'
    }
  },
  {
    area: 'Shipments & Logistics',
    description: 'Outbound shipments, freight documentation, tracking',
    access: {
      admin: 'Full',
      planner: 'Edit',
      qa: 'View',
      viewer: 'View'
    }
  },
  {
    area: 'Compliance & QA',
    description: 'Quality checks, grading, certification packs',
    access: {
      admin: 'Full',
      planner: 'View',
      qa: 'Full',
      viewer: 'View'
    }
  },
  {
    area: 'User & Role Admin',
    description: 'Identity management, access reviews, session control',
    access: {
      admin: 'Full',
      planner: 'Request',
      qa: 'Request',
      viewer: 'None'
    }
  }
]


