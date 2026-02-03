import { useEffect, useMemo, useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileText, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import ResponsiveTable from '@/components/ResponsiveTable'
import { Spinner } from '@/components/ui/spinner'

interface AuditLog {
  id: string
  table_schema: string
  table_name: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  changed_by: string | null
  change_time: string
  primary_key: Record<string, unknown> | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  change_summary: string | null
  meta: Record<string, unknown> | null
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch (error) {
    return '—'
  }
}

function getOperationColor(operation: string) {
  switch (operation) {
    case 'INSERT':
      return 'bg-green-100 text-green-800'
    case 'UPDATE':
      return 'bg-blue-100 text-blue-800'
    case 'DELETE':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTable, setFilterTable] = useState('')
  const [filterOperation, setFilterOperation] = useState('')
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  const fetchLogs = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('change_time', { ascending: false })
        .limit(500)

      const { data, error } = await query

      if (error) {
        throw error
      }

      setLogs((data as AuditLog[]) || [])
    } catch (error) {
      console.error('Error fetching audit logs:', error)
      toast.error('Failed to load audit logs')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  const filteredLogs = useMemo(() => {
    let filtered = logs

    if (searchTerm.trim()) {
      const normalized = searchTerm.trim().toLowerCase()
      filtered = filtered.filter((log) => {
        const tableMatch = log.table_name?.toLowerCase().includes(normalized)
        const summaryMatch = log.change_summary?.toLowerCase().includes(normalized)
        const primaryKeyMatch = log.primary_key
          ? JSON.stringify(log.primary_key).toLowerCase().includes(normalized)
          : false
        return tableMatch || summaryMatch || primaryKeyMatch
      })
    }

    if (filterTable.trim()) {
      filtered = filtered.filter((log) =>
        log.table_name?.toLowerCase().includes(filterTable.trim().toLowerCase())
      )
    }

    if (filterOperation) {
      filtered = filtered.filter((log) => log.operation === filterOperation)
    }

    return filtered
  }, [logs, searchTerm, filterTable, filterOperation])

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize))
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredLogs.slice(startIndex, startIndex + pageSize)
  }, [filteredLogs, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, filterTable, filterOperation])

  const tableNames = useMemo(() => {
    const uniqueTables = new Set<string>()
    logs.forEach((log) => {
      if (log.table_name) {
        uniqueTables.add(log.table_name)
      }
    })
    return Array.from(uniqueTables).sort()
  }, [logs])

  const handleRefresh = async () => {
    await fetchLogs()
    toast.success('Audit logs refreshed')
  }

  const handleRowClick = (log: AuditLog) => {
    setSelectedLog(log)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedLog(null)
  }

  const formatJSON = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '—'
    }
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  const columns = [
    {
      key: 'change_time',
      header: 'Timestamp',
      accessor: 'change_time',
      render: (log: AuditLog) => (
        <span className="font-mono text-xs">{formatDate(log.change_time)}</span>
      ),
      mobileHeader: 'Time'
    },
    {
      key: 'table_name',
      header: 'Table',
      accessor: 'table_name',
      render: (log: AuditLog) => (
        <div className="flex flex-col">
          <span className="font-medium">{log.table_name}</span>
          <span className="text-xs text-text-dark/60">{log.table_schema}</span>
        </div>
      ),
      mobileHeader: 'Table'
    },
    {
      key: 'operation',
      header: 'Operation',
      accessor: 'operation',
      render: (log: AuditLog) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getOperationColor(
            log.operation
          )}`}
        >
          {log.operation}
        </span>
      ),
      mobileHeader: 'Op'
    },
    {
      key: 'primary_key',
      header: 'Record ID',
      accessor: 'primary_key',
      render: (log: AuditLog) => (
        <span className="font-mono text-xs">
          {log.primary_key ? JSON.stringify(log.primary_key) : '—'}
        </span>
      ),
      mobileHeader: 'ID',
      hideOnMobile: true
    },
    {
      key: 'change_summary',
      header: 'Summary',
      accessor: 'change_summary',
      render: (log: AuditLog) => (
        <span className="text-sm">{log.change_summary || '—'}</span>
      ),
      mobileHeader: 'Summary'
    },
    {
      key: 'changed_by',
      header: 'Changed By',
      accessor: 'changed_by',
      render: (log: AuditLog) => (
        <span className="font-mono text-xs">{log.changed_by || 'System'}</span>
      ),
      hideOnMobile: true
    }
  ]

  if (loading) {
    return (
      <PageLayout
        title="Audit Logs"
        activeItem="audit"
      >
        <Spinner text="Loading audit logs..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Audit Logs"
      activeItem="audit"
      actions={
        <Button size="sm" variant="outline" onClick={handleRefresh} disabled={loading}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-olive/10">
                  <FileText className="h-5 w-5 text-olive" />
                </div>
                <div>
                  <CardTitle className="text-lg">System Audit Trail</CardTitle>
                  <p className="text-sm text-text-dark/60">
                    Track all changes made to database records across the system.
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Search by table, summary, or record ID"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:max-w-sm"
                />
                <select
                  value={filterTable}
                  onChange={(e) => setFilterTable(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2"
                >
                  <option value="">All Tables</option>
                  {tableNames.map((table) => (
                    <option key={table} value={table}>
                      {table}
                    </option>
                  ))}
                </select>
                <select
                  value={filterOperation}
                  onChange={(e) => setFilterOperation(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2"
                >
                  <option value="">All Operations</option>
                  <option value="INSERT">INSERT</option>
                  <option value="UPDATE">UPDATE</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center px-4 py-16 text-sm text-text-dark/60">
                Loading audit logs…
              </div>
            ) : (
              <ResponsiveTable
                columns={columns}
                data={paginatedLogs}
                rowKey="id"
                emptyMessage="No audit logs found"
                onRowClick={handleRowClick}
              />
            )}

            {!loading && filteredLogs.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-olive-light/20 pt-4 sm:flex-row">
                <p className="text-xs text-text-dark/60">
                  Showing {(currentPage - 1) * pageSize + 1}-
                  {Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length} logs
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-text-dark/70">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isModalOpen && selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-text-dark">Audit Log Details</h2>
                <p className="text-sm text-text-dark/70">
                  Complete information about this audit log entry
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCloseModal}
                className="text-text-dark hover:bg-olive-light/10"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="overflow-y-auto bg-beige/10 px-6 py-6">
              <div className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-dark/70">
                    Basic Information
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-text-dark/70">Log ID</label>
                      <div className="rounded-md border border-olive-light/30 bg-white p-3 font-mono text-sm">
                        {selectedLog.id}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-text-dark/70">Timestamp</label>
                      <div className="rounded-md border border-olive-light/30 bg-white p-3 text-sm">
                        {formatDate(selectedLog.change_time)}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-text-dark/70">Table Schema</label>
                      <div className="rounded-md border border-olive-light/30 bg-white p-3 text-sm">
                        {selectedLog.table_schema}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-text-dark/70">Table Name</label>
                      <div className="rounded-md border border-olive-light/30 bg-white p-3 text-sm font-medium">
                        {selectedLog.table_name}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-text-dark/70">Operation</label>
                      <div className="rounded-md border border-olive-light/30 bg-white p-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getOperationColor(
                            selectedLog.operation
                          )}`}
                        >
                          {selectedLog.operation}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-text-dark/70">Changed By</label>
                      <div className="rounded-md border border-olive-light/30 bg-white p-3 font-mono text-sm">
                        {selectedLog.changed_by || 'System'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Primary Key */}
                {selectedLog.primary_key && (
                  <div>
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-dark/70">
                      Primary Key
                    </h3>
                    <div className="rounded-md border border-olive-light/30 bg-white p-4">
                      <pre className="overflow-x-auto text-xs font-mono text-text-dark">
                        {formatJSON(selectedLog.primary_key)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Change Summary */}
                {selectedLog.change_summary && (
                  <div>
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-dark/70">
                      Change Summary
                    </h3>
                    <div className="rounded-md border border-olive-light/30 bg-white p-4 text-sm">
                      {selectedLog.change_summary}
                    </div>
                  </div>
                )}

                {/* Old Data */}
                {selectedLog.old_data && (
                  <div>
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-dark/70">
                      Old Data
                    </h3>
                    <div className="rounded-md border border-olive-light/30 bg-white p-4">
                      <pre className="max-h-64 overflow-auto text-xs font-mono text-text-dark">
                        {formatJSON(selectedLog.old_data)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* New Data */}
                {selectedLog.new_data && (
                  <div>
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-dark/70">
                      New Data
                    </h3>
                    <div className="rounded-md border border-olive-light/30 bg-white p-4">
                      <pre className="max-h-64 overflow-auto text-xs font-mono text-text-dark">
                        {formatJSON(selectedLog.new_data)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {selectedLog.meta && Object.keys(selectedLog.meta).length > 0 && (
                  <div>
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-dark/70">
                      Metadata
                    </h3>
                    <div className="rounded-md border border-olive-light/30 bg-white p-4">
                      <pre className="max-h-64 overflow-auto text-xs font-mono text-text-dark">
                        {formatJSON(selectedLog.meta)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-olive-light/30 px-6 py-4">
              <Button variant="outline" onClick={handleCloseModal}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default AuditLogs
