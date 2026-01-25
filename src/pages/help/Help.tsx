import { useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  HelpCircle,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Search,
  LayoutDashboard,
  Warehouse,
  Package2,
  Truck,
  Users,
  Settings,
  FileText,
  ListChecks,
  Building2,
  ArrowDownCircle,
  Cog,
  Eye,
  Layers,
} from 'lucide-react'

interface HelpSection {
  id: string
  title: string
  icon: React.ElementType
  content: React.ReactNode
}

function Help() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['getting-started']))
  const [searchTerm, setSearchTerm] = useState('')

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId)
      } else {
        newSet.add(sectionId)
      }
      return newSet
    })
  }

  const helpSections: HelpSection[] = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      icon: BookOpen,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">Welcome to Nutaria</h4>
            <p className="text-sm text-text-dark/70">
              Nutaria is a comprehensive supply chain management system designed to help you manage your inventory,
              track supplies, monitor processes, and maintain quality control throughout your operations.
            </p>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">Key Concepts</h4>
            <ul className="list-disc space-y-2 pl-5 text-sm text-text-dark/70">
              <li>
                <strong>Supplies:</strong> Raw materials and inputs that enter your system
              </li>
              <li>
                <strong>Products:</strong> Finished goods that are produced and stored
              </li>
              <li>
                <strong>Processes:</strong> Manufacturing or transformation workflows
              </li>
              <li>
                <strong>Stock Levels:</strong> Current inventory quantities in warehouses
              </li>
              <li>
                <strong>Shipments:</strong> Outbound deliveries to customers
              </li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'navigation',
      title: 'Navigation Guide',
      icon: Search,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="mb-3 font-semibold text-text-dark">Main Menu Items</h4>
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-olive-light/30 bg-white p-3">
                <LayoutDashboard className="mt-0.5 h-5 w-5 flex-shrink-0 text-olive" />
                <div>
                  <p className="font-medium text-text-dark">Dashboard</p>
                  <p className="text-sm text-text-dark/70">
                    Overview of key metrics, low stock alerts, and recent activity
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-olive-light/30 bg-white p-3">
                <Warehouse className="mt-0.5 h-5 w-5 flex-shrink-0 text-olive" />
                <div>
                  <p className="font-medium text-text-dark">Inventory</p>
                  <p className="text-sm text-text-dark/70">
                    Monitor stock levels and track stock movements across warehouses
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-olive-light/30 bg-white p-3">
                <ArrowDownCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-olive" />
                <div>
                  <p className="font-medium text-text-dark">Supplies</p>
                  <p className="text-sm text-text-dark/70">
                    Manage incoming supplies, view quality checks, and track batches
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-olive-light/30 bg-white p-3">
                <Cog className="mt-0.5 h-5 w-5 flex-shrink-0 text-olive" />
                <div>
                  <p className="font-medium text-text-dark">Process</p>
                  <p className="text-sm text-text-dark/70">
                    View process executions and track step-by-step progress
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-olive-light/30 bg-white p-3">
                <Building2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-olive" />
                <div>
                  <p className="font-medium text-text-dark">Partner</p>
                  <p className="text-sm text-text-dark/70">Manage suppliers and customers</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-olive-light/30 bg-white p-3">
                <Truck className="mt-0.5 h-5 w-5 flex-shrink-0 text-olive" />
                <div>
                  <p className="font-medium text-text-dark">Shipments</p>
                  <p className="text-sm text-text-dark/70">Track outbound deliveries and shipments</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-olive-light/30 bg-white p-3">
                <ListChecks className="mt-0.5 h-5 w-5 flex-shrink-0 text-olive" />
                <div>
                  <p className="font-medium text-text-dark">Daily Checks</p>
                  <p className="text-sm text-text-dark/70">
                    Perform and track daily quality and safety checks
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-olive-light/30 bg-white p-3">
                <Users className="mt-0.5 h-5 w-5 flex-shrink-0 text-olive" />
                <div>
                  <p className="font-medium text-text-dark">Users</p>
                  <p className="text-sm text-text-dark/70">
                    Manage user accounts, roles, and permissions
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-olive-light/30 bg-white p-3">
                <Settings className="mt-0.5 h-5 w-5 flex-shrink-0 text-olive" />
                <div>
                  <p className="font-medium text-text-dark">Settings</p>
                  <p className="text-sm text-text-dark/70">
                    Configure units, warehouses, products, and processes
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-olive-light/30 bg-white p-3">
                <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-olive" />
                <div>
                  <p className="font-medium text-text-dark">Audit Logs</p>
                  <p className="text-sm text-text-dark/70">
                    View system activity and track all database changes
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'common-tasks',
      title: 'Common Tasks',
      icon: Cog,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">Adding a New Product</h4>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-text-dark/70">
              <li>Navigate to Settings → Products</li>
              <li>Click "Add Product" button</li>
              <li>Fill in product details (name, description, unit of measure)</li>
              <li>Set reorder point and safety stock levels</li>
              <li>Save the product</li>
            </ol>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">Recording a Stock Movement</h4>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-text-dark/70">
              <li>Go to Inventory → Stock Movements</li>
              <li>Click "Add Movement"</li>
              <li>Select product and warehouse</li>
              <li>Enter quantity and movement type (in/out/transfer)</li>
              <li>Add notes if needed and save</li>
            </ol>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">Performing Daily Checks</h4>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-text-dark/70">
              <li>Go to Daily Checks</li>
              <li>Review pending checks shown in the badge</li>
              <li>Click on a check to open it</li>
              <li>Complete all required fields</li>
              <li>Submit the check</li>
            </ol>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">Viewing Process Progress</h4>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-text-dark/70">
              <li>Navigate to Process → Process View</li>
              <li>Select a process from the list</li>
              <li>View current step and overall progress</li>
              <li>Review historical process runs if available</li>
            </ol>
          </div>
        </div>
      ),
    },
    {
      id: 'tips',
      title: 'Tips & Best Practices',
      icon: Eye,
      content: (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h4 className="mb-2 font-semibold text-blue-900">Search Tips</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm text-blue-800">
              <li>Use the search bars to quickly find items across different pages</li>
              <li>Filters help narrow down results by specific criteria</li>
              <li>Click on table rows to view detailed information</li>
            </ul>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <h4 className="mb-2 font-semibold text-green-900">Data Management</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm text-green-800">
              <li>Regularly review low stock alerts on the Dashboard</li>
              <li>Keep product information up to date</li>
              <li>Record stock movements promptly for accurate inventory tracking</li>
              <li>Complete daily checks on schedule to maintain quality standards</li>
            </ul>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h4 className="mb-2 font-semibold text-amber-900">User Management</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
              <li>Assign appropriate roles to users based on their responsibilities</li>
              <li>Only admins can create and manage user accounts</li>
              <li>Review audit logs regularly to track system activity</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'faq',
      title: 'Frequently Asked Questions',
      icon: HelpCircle,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">How do I reset my password?</h4>
            <p className="text-sm text-text-dark/70">
              Contact your system administrator to reset your password. They can update your password through the User
              Management page.
            </p>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">Why can't I see certain menu items?</h4>
            <p className="text-sm text-text-dark/70">
              Menu visibility and access are controlled by your user role. If you need access to additional features,
              contact your administrator to update your role permissions.
            </p>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">How do I export data?</h4>
            <p className="text-sm text-text-dark/70">
              Currently, data export functionality is available through the audit logs. Use the audit log view modal to
              copy detailed information about specific records.
            </p>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">What should I do if I see incorrect data?</h4>
            <p className="text-sm text-text-dark/70">
              First, verify the information by checking related records. If the data is indeed incorrect, contact your
              administrator. You can also check the audit logs to see when and how the data was changed.
            </p>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">How often is the dashboard updated?</h4>
            <p className="text-sm text-text-dark/70">
              Dashboard data is refreshed in real-time. Use the refresh button to manually update the data if needed.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'support',
      title: 'Support & Contact',
      icon: Users,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">Need Help?</h4>
            <p className="text-sm text-text-dark/70">
              If you encounter any issues or have questions about using the system, please reach out to your system
              administrator or IT support team.
            </p>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">Reporting Issues</h4>
            <p className="text-sm text-text-dark/70">
              When reporting an issue, please include:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-text-dark/70">
              <li>A clear description of the problem</li>
              <li>The page or feature you were using</li>
              <li>Steps to reproduce the issue</li>
              <li>Screenshots if applicable</li>
              <li>Any error messages you see</li>
            </ul>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-text-dark">System Information</h4>
            <div className="rounded-lg border border-olive-light/30 bg-white p-4">
              <p className="text-sm text-text-dark/70">
                Nutaria Supply Chain Management System
              </p>
              <p className="mt-1 text-xs text-text-dark/60">
                Check the Audit Logs page for system activity and change history.
              </p>
            </div>
          </div>
        </div>
      ),
    },
  ]

  const filteredSections = helpSections.filter((section) => {
    if (!searchTerm.trim()) return true
    const search = searchTerm.toLowerCase()
    return (
      section.title.toLowerCase().includes(search) ||
      (typeof section.content === 'string' && section.content.toLowerCase().includes(search))
    )
  })

  return (
    <PageLayout title="Help & Documentation" activeItem="help">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-olive/10">
                  <HelpCircle className="h-5 w-5 text-olive" />
                </div>
                <div>
                  <CardTitle className="text-lg">Help Center</CardTitle>
                  <p className="text-sm text-text-dark/60">
                    Find answers to common questions and learn how to use Nutaria effectively.
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dark/40" />
              <input
                type="text"
                placeholder="Search help topics..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-4 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-3">
              {filteredSections.map((section) => {
                const Icon = section.icon
                const isExpanded = expandedSections.has(section.id)
                return (
                  <Card key={section.id} className="overflow-hidden">
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="flex w-full items-center justify-between p-4 text-left hover:bg-olive-light/5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-olive" />
                        <h3 className="font-semibold text-text-dark">{section.title}</h3>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-text-dark/40" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-text-dark/40" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-olive-light/20 p-4">
                        {section.content}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>

            {filteredSections.length === 0 && (
              <div className="flex items-center justify-center px-4 py-16 text-sm text-text-dark/60">
                No help topics found matching "{searchTerm}"
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}

export default Help

