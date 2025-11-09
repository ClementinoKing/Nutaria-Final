import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eye, Clock, X, CheckCircle, AlertTriangle, Package, Award, Activity, UserCog, MapPin } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'

// Mock data for supplies with process timeline data
const mockSupplies = [
  { 
    id: 1,
    supply_doc_no: 'SUP-2024-001',
    batch_lot_no: 'LOT-2024-001',
    product_name: 'Pecan Wholes',
    product_sku: 'PEC001',
    received_at: '2024-01-25T10:00:00Z',
    timeline: [
      { id: 1, type: 'EVENT', step: 'Receiving & Inspection', event_type: 'START', timestamp: '2024-01-25T10:00:00Z', operator: 'John Smith', status: 'completed' },
      { id: 2, type: 'QUALITY_CHECK', step: 'Receiving & Inspection', check_type: 'Moisture Content', passed: true, timestamp: '2024-01-25T10:30:00Z', operator: 'John Smith' },
      { id: 3, type: 'QUALITY_CHECK', step: 'Receiving & Inspection', check_type: 'Foreign Matter', passed: true, timestamp: '2024-01-25T10:45:00Z', operator: 'John Smith' },
      { id: 4, type: 'EVENT', step: 'Receiving & Inspection', event_type: 'COMPLETE', timestamp: '2024-01-25T11:30:00Z', operator: 'John Smith', status: 'completed' },
      { id: 5, type: 'EVENT', step: 'Cleaning', event_type: 'START', timestamp: '2024-01-25T12:00:00Z', operator: 'Sarah Johnson', status: 'completed' },
      { id: 6, type: 'EVENT', step: 'Cleaning', event_type: 'COMPLETE', timestamp: '2024-01-25T14:00:00Z', operator: 'Sarah Johnson', status: 'completed' },
      { id: 7, type: 'EVENT', step: 'Shelling', event_type: 'START', timestamp: '2024-01-25T14:30:00Z', operator: 'Sarah Johnson', status: 'completed' },
      { id: 8, type: 'EVENT', step: 'Shelling', event_type: 'COMPLETE', timestamp: '2024-01-25T16:00:00Z', operator: 'Sarah Johnson', status: 'completed' },
      { id: 9, type: 'GRADING', step: 'Grading', grade: 'Premium', timestamp: '2024-01-25T16:30:00Z', operator: 'Emily Davis', status: 'completed' },
      { id: 10, type: 'PACKAGING', step: 'Packaging', packaging_profile: 'Premium Vacuum Pack 1kg', qty: 145.5, timestamp: '2024-01-25T17:00:00Z', operator: 'Mike Williams', status: 'completed' },
      { id: 11, type: 'STORAGE', step: 'Storage Allocation', location: 'A-01-05', timestamp: '2024-01-25T17:30:00Z', status: 'completed' },
    ]
  },
  { 
    id: 2,
    supply_doc_no: 'SUP-2024-002',
    batch_lot_no: 'LOT-2024-002',
    product_name: 'Mac Wholes',
    product_sku: 'MAC001',
    received_at: '2024-01-26T14:30:00Z',
    timeline: [
      { id: 1, type: 'EVENT', step: 'Receiving & Inspection', event_type: 'START', timestamp: '2024-01-26T14:30:00Z', operator: 'John Smith', status: 'completed' },
      { id: 2, type: 'QUALITY_CHECK', step: 'Receiving & Inspection', check_type: 'Moisture Content', passed: false, timestamp: '2024-01-26T15:00:00Z', operator: 'John Smith', severity: 'error' },
      { id: 2.5, type: 'QUALITY_CHECK', step: 'Receiving & Inspection', check_type: 'Temperature Check', passed: true, timestamp: '2024-01-26T15:05:00Z', operator: 'John Smith', severity: 'warning', note: 'Temperature slightly above normal range' },
      { id: 3, type: 'REJECT', step: 'Receiving & Inspection', reject_reason: 'Moisture content too high - exceeds maximum threshold', action_taken: 'REWORK', quantity: 5.0, timestamp: '2024-01-26T15:15:00Z', severity: 'error' },
      { id: 4, type: 'EVENT', step: 'Receiving & Inspection', event_type: 'COMPLETE', timestamp: '2024-01-26T16:00:00Z', operator: 'John Smith', status: 'completed' },
      { id: 5, type: 'GRADING', step: 'Grading', grade: 'Standard', timestamp: '2024-01-26T16:30:00Z', operator: 'Emily Davis', status: 'completed' },
      { id: 6, type: 'PACKAGING', step: 'Packaging', packaging_profile: 'Standard Vacuum Pack 1kg', qty: 195.0, timestamp: '2024-01-26T17:00:00Z', operator: 'Mike Williams', status: 'in_progress' },
    ]
  },
  { 
    id: 3,
    supply_doc_no: 'SUP-2024-003',
    batch_lot_no: 'LOT-2024-003',
    product_name: 'Mac Pieces',
    product_sku: 'MAC003',
    received_at: '2024-01-27T11:15:00Z',
    timeline: [
      { id: 1, type: 'EVENT', step: 'Receiving & Inspection', event_type: 'START', timestamp: '2024-01-27T11:15:00Z', operator: 'John Smith', status: 'pending' },
    ]
  },
]

function ProcessView() {
  const [supplies] = useState(mockSupplies)
  const [selectedSupply, setSelectedSupply] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleView = (supply) => {
    setSelectedSupply(supply)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedSupply(null)
  }

  const getTimelineIcon = (item) => {
    switch(item.type) {
      case 'EVENT':
        return <Activity className="h-4 w-4" />
      case 'QUALITY_CHECK':
        return item.passed ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />
      case 'GRADING':
        return <Award className="h-4 w-4" />
      case 'PACKAGING':
        return <Package className="h-4 w-4" />
      case 'STORAGE':
        return <Clock className="h-4 w-4" />
      case 'REJECT':
        return <AlertTriangle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const columns = [
    {
      key: 'supply_doc_no',
      header: 'Supply Doc No',
      accessor: 'supply_doc_no',
      cellClassName: 'font-medium text-text-dark',
    },
    {
      key: 'batch_lot_no',
      header: 'Batch Lot No',
      accessor: 'batch_lot_no',
      cellClassName: 'font-medium text-text-dark',
    },
    {
      key: 'product',
      header: 'Product',
      render: (supply) => (
        <div>
          <div className="text-text-dark font-medium">{supply.product_name}</div>
          <div className="text-xs text-text-dark/60">{supply.product_sku}</div>
        </div>
      ),
      mobileRender: (supply) => (
        <div className="text-right">
          <div className="text-text-dark font-medium">{supply.product_name}</div>
          <div className="text-xs text-text-dark/60">{supply.product_sku}</div>
        </div>
      ),
    },
    {
      key: 'received_at',
      header: 'Received At',
      render: (supply) => new Date(supply.received_at).toLocaleString(),
      mobileRender: (supply) => new Date(supply.received_at).toLocaleString(),
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-sm text-text-dark',
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      mobileValueClassName: 'flex w-full justify-end',
      render: (supply) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleView(supply)}
            className="text-olive hover:text-olive-dark"
          >
            <Eye className="mr-2 h-4 w-4" />
            View
          </Button>
        </div>
      ),
      mobileRender: (supply) => (
        <div className="flex w-full justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleView(supply)}
            className="text-olive hover:text-olive-dark"
          >
            <Eye className="mr-2 h-4 w-4" />
            View
          </Button>
        </div>
      ),
      mobileHeader: 'Actions',
    },
  ]

  return (
    <PageLayout title="Process View" activeItem="process" stickyHeader={false} contentClassName="px-4 sm:px-6 lg:px-8 py-8">
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Process View</CardTitle>
          <CardDescription>View process timeline for supplies</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable columns={columns} data={supplies} rowKey="id" />
        </CardContent>
      </Card>

      {/* Modal */}
      {isModalOpen && selectedSupply && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-olive-light/20 p-4 sm:p-6">
              <div>
                <h2 className="text-xl font-bold text-text-dark sm:text-2xl">Process Timeline</h2>
                <p className="mt-1 text-sm text-text-dark/70">
                  {selectedSupply.supply_doc_no} - {selectedSupply.product_name}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeModal}
                className="text-text-dark hover:bg-olive-light/10"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto bg-gradient-to-b from-beige/30 to-white p-4 sm:p-8">
              <div className="relative mx-auto max-w-3xl">
                {/* Timeline Line */}
                <div className="absolute left-6 top-0 bottom-0 w-1 rounded-full bg-gradient-to-b from-olive/20 via-olive/30 to-olive/20 sm:left-8"></div>

                {/* Timeline Items */}
                <div className="space-y-8">
                  {selectedSupply.timeline.map((item) => (
                    <div key={item.id} className="relative flex items-start group">
                      {/* Timeline Icon Container */}
                      <div className="relative z-10 flex-shrink-0 pl-2 sm:pl-0">
                        {/* Outer Ring */}
                        <div className={`absolute inset-0 rounded-full transition-all duration-300 ${
                          item.type === 'REJECT' || (item.type === 'QUALITY_CHECK' && !item.passed) ? 'bg-red-500/30 animate-pulse' :
                          item.severity === 'warning' ? 'bg-orange-500/20' :
                          item.status === 'completed' ? 'bg-olive/30' :
                          item.status === 'in_progress' ? 'bg-brown/30 animate-pulse' :
                          'bg-olive-light/30'
                        }`} style={{ width: '56px', height: '56px', marginLeft: '-4px', marginTop: '-4px' }}></div>
                        
                        {/* Icon Circle */}
                        <div className={`relative flex items-center justify-center w-12 h-12 rounded-full border-3 shadow-lg transition-all duration-300 ${
                          item.type === 'REJECT' || (item.type === 'QUALITY_CHECK' && !item.passed) ? 'bg-red-500 border-red-600 text-white shadow-red-500/30' :
                          item.severity === 'warning' ? 'bg-orange-500 border-orange-600 text-white shadow-orange-500/30' :
                          item.status === 'completed' ? 'bg-olive border-olive-dark text-white' :
                          item.status === 'in_progress' ? 'bg-brown border-brown text-white' :
                          'bg-olive-light border-olive text-white'
                        } group-hover:scale-110`}>
                          {getTimelineIcon(item)}
                        </div>
                      </div>

                      {/* Timeline Content */}
                      <div className="ml-6 flex-1 pb-8 sm:ml-8">
                        <div className={`rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden ${
                          item.type === 'REJECT' || (item.type === 'QUALITY_CHECK' && !item.passed) 
                            ? 'bg-white border-2 border-red-300 shadow-red-500/10' 
                            : item.severity === 'warning'
                            ? 'bg-white border-2 border-orange-300 shadow-orange-500/10'
                            : 'bg-white border border-olive-light/30'
                        }`}>
                          {/* Header */}
                          <div className={`px-6 py-4 border-b ${
                            item.type === 'REJECT' || (item.type === 'QUALITY_CHECK' && !item.passed)
                              ? 'bg-gradient-to-r from-red-50 to-red-50/50 border-red-200'
                              : item.severity === 'warning'
                              ? 'bg-gradient-to-r from-orange-50 to-orange-50/50 border-orange-200'
                              : 'bg-gradient-to-r from-beige/50 to-white border-olive-light/20'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <h3 className="text-lg font-semibold text-gray-900">{item.step}</h3>
                                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${
                                  item.type === 'REJECT' || (item.type === 'QUALITY_CHECK' && !item.passed) 
                                    ? 'bg-red-100 text-red-800 border border-red-300 shadow-sm' :
                                  item.severity === 'warning'
                                    ? 'bg-orange-100 text-orange-800 border border-orange-300 shadow-sm' :
                                  item.status === 'completed' 
                                    ? 'bg-olive-light/30 text-olive-dark' :
                                  item.status === 'in_progress' 
                                    ? 'bg-brown/20 text-brown' :
                                  'bg-beige text-brown'
                                }`}>
                                  {item.type === 'REJECT' ? 'Error' : 
                                   item.type === 'QUALITY_CHECK' && !item.passed ? 'Failed' :
                                   item.severity === 'warning' ? 'Warning' :
                                   item.status === 'completed' ? 'Completed' : 
                                   item.status === 'in_progress' ? 'In Progress' : 'Pending'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500 sm:text-sm">
                                <Clock className="h-4 w-4" />
                                <span className="font-medium">
                                  {new Date(item.timestamp).toLocaleString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Content */}
                          <div className="px-6 py-5">
                            {item.type === 'EVENT' && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <Activity className="h-5 w-5 text-olive" />
                                  <span className="font-semibold text-gray-900">Process Event</span>
                                  <span className="ml-auto px-3 py-1 bg-olive-light/20 text-olive-dark rounded-md text-sm font-medium">
                                    {item.event_type}
                                  </span>
                                </div>
                                {item.operator && (
                                  <div className="flex items-center gap-2 text-sm text-gray-600 mt-4 pt-4 border-t border-olive-light/20">
                                    <UserCog className="h-4 w-4 text-gray-400" />
                                    <span className="font-medium">Operator:</span>
                                    <span>{item.operator}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {item.type === 'QUALITY_CHECK' && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  {!item.passed ? (
                                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100">
                                      <AlertTriangle className="h-5 w-5 text-red-600" />
                                    </div>
                                  ) : item.severity === 'warning' ? (
                                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100">
                                      <AlertTriangle className="h-5 w-5 text-orange-600" />
                                    </div>
                                  ) : (
                                    <CheckCircle className="h-5 w-5 text-olive" />
                                  )}
                                  <span className="font-semibold text-gray-900">Quality Check</span>
                                  <span className={`ml-auto px-3 py-1.5 rounded-md text-sm font-semibold ${
                                    !item.passed 
                                      ? 'bg-red-50 text-red-700 border border-red-300' 
                                      : item.severity === 'warning'
                                      ? 'bg-orange-50 text-orange-700 border border-orange-300'
                                      : 'bg-olive-light/20 text-olive-dark'
                                  }`}>
                                    {!item.passed ? 'Failed' : item.severity === 'warning' ? 'Warning' : 'Passed'}
                                  </span>
                                </div>
                                <div className={`mt-4 pt-4 space-y-3 ${
                                  !item.passed ? 'border-t border-red-200/50' : 
                                  item.severity === 'warning' ? 'border-t border-orange-200/50' :
                                  'border-t border-olive-light/20'
                                }`}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-600">Check Type:</span>
                                    <span className={`text-sm font-medium ${
                                      !item.passed ? 'text-red-900' : 
                                      item.severity === 'warning' ? 'text-orange-900' :
                                      'text-gray-900'
                                    }`}>{item.check_type}</span>
                                  </div>
                                  {!item.passed && (
                                    <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded-r-md">
                                      <div className="flex items-start gap-2">
                                        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                                        <div>
                                          <p className="text-sm font-semibold text-red-900 mb-1">Quality Check Failed</p>
                                          <p className="text-sm text-red-800">Action required - Product does not meet quality standards</p>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  {item.severity === 'warning' && item.note && (
                                    <div className="p-3 bg-orange-50 border-l-4 border-orange-500 rounded-r-md">
                                      <div className="flex items-start gap-2">
                                        <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                                        <div>
                                          <p className="text-sm font-semibold text-orange-900 mb-1">Warning</p>
                                          <p className="text-sm text-orange-800">{item.note}</p>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  {item.operator && (
                                    <div className="flex items-center gap-2 text-sm text-gray-600 pt-2">
                                      <UserCog className="h-4 w-4 text-gray-400" />
                                      <span className="font-medium">Inspected By:</span>
                                      <span>{item.operator}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {item.type === 'GRADING' && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <Award className="h-5 w-5 text-olive" />
                                  <span className="font-semibold text-gray-900">Grading Result</span>
                                  <span className="ml-auto px-3 py-1 bg-olive-light/20 text-olive-dark rounded-md text-sm font-medium">
                                    {item.grade}
                                  </span>
                                </div>
                                {item.operator && (
                                  <div className="flex items-center gap-2 text-sm text-gray-600 mt-4 pt-4 border-t border-gray-100">
                                    <UserCog className="h-4 w-4 text-gray-400" />
                                    <span className="font-medium">Graded By:</span>
                                    <span>{item.operator}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {item.type === 'PACKAGING' && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <Package className="h-5 w-5 text-olive" />
                                  <span className="font-semibold text-gray-900">Packaging Event</span>
                                </div>
                                <div className="mt-4 pt-4 border-t border-olive-light/20 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-600">Profile:</span>
                                    <span className="text-sm text-gray-900">{item.packaging_profile}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-600">Quantity:</span>
                                    <span className="text-sm font-semibold text-gray-900">{item.qty} kg</span>
                                  </div>
                                  {item.operator && (
                                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-2 pt-2 border-t border-olive-light/20">
                                      <UserCog className="h-4 w-4 text-gray-400" />
                                      <span className="font-medium">Packaged By:</span>
                                      <span>{item.operator}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {item.type === 'STORAGE' && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-5 w-5 text-olive" />
                                  <span className="font-semibold text-gray-900">Storage Allocation</span>
                                </div>
                                <div className="mt-4 pt-4 border-t border-olive-light/20">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-600">Location:</span>
                                    <span className="text-sm font-semibold text-gray-900 bg-olive-light/20 text-olive-dark px-3 py-1 rounded-md">
                                      {item.location}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {item.type === 'REJECT' && (
                              <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                                    <AlertTriangle className="h-6 w-6 text-red-600" />
                                  </div>
                                  <div className="flex-1">
                                    <span className="font-semibold text-gray-900 text-lg">Reject / Error</span>
                                    <p className="text-xs text-gray-500 mt-0.5">Action required</p>
                                  </div>
                                  <span className="px-3 py-1.5 bg-red-100 text-red-800 border border-red-300 rounded-lg text-sm font-semibold">
                                    {item.action_taken}
                                  </span>
                                </div>
                                <div className="mt-4 pt-4 border-t border-red-200/50 space-y-3">
                                  <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md">
                                    <div className="flex items-start gap-3">
                                      <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                                      <div className="flex-1">
                                        <p className="text-sm font-semibold text-red-900 mb-1">Error Reason</p>
                                        <p className="text-sm text-red-800">{item.reject_reason}</p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between pt-2">
                                    <span className="text-sm font-medium text-gray-700">Affected Quantity:</span>
                                    <span className="text-sm font-bold text-red-900 bg-red-100 px-3 py-1.5 rounded-md border border-red-300">
                                      {item.quantity} kg
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end border-t border-olive-light/20 p-4 sm:p-6">
              <Button onClick={closeModal} className="bg-olive hover:bg-olive-dark">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default ProcessView

