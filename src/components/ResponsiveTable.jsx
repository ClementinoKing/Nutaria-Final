import { cn } from '@/lib/utils'

function getColumnKey(column) {
  return column.key ?? column.accessor ?? column.header
}

function renderColumnValue(column, item, rowIndex) {
  if (typeof column.render === 'function') {
    return column.render(item, rowIndex)
  }

  if (column.accessor) {
    return item?.[column.accessor]
  }

  return null
}

function ResponsiveTable({
  columns,
  data,
  rowKey,
  emptyMessage = 'No records found',
  tableClassName,
  mobileCardClassName,
  getRowClassName,
  onRowClick,
}) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return null
  }

  const resolveRowKey = (item, index) => {
    if (typeof rowKey === 'function') {
      return rowKey(item, index)
    }

    if (typeof rowKey === 'string' && item && item[rowKey] !== undefined) {
      return item[rowKey]
    }

    return index
  }

  const resolveRowClassName = (item, index) => {
    if (typeof getRowClassName === 'function') {
      return getRowClassName(item, index)
    }

    return undefined
  }

  return (
    <div className="w-full">
      <div className="hidden sm:block">
        <div className="overflow-x-auto">
          <table
            className={cn(
              'min-w-full divide-y divide-olive-light/20 bg-white',
              tableClassName
            )}
          >
            <thead className="bg-olive-light/10">
              <tr>
                {columns.map((column) => {
                  const columnKey = getColumnKey(column)
                  return (
                    <th
                      key={columnKey}
                      scope="col"
                      className={cn(
                        'px-4 py-3 text-left text-sm font-medium text-text-dark',
                        column.headerClassName
                      )}
                    >
                      {column.header}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-olive-light/10">
              {data.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-6 text-center text-sm text-text-dark/60"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                data.map((item, rowIndex) => (
                  <tr
                    key={resolveRowKey(item, rowIndex)}
                    className={cn(
                      'transition-colors hover:bg-olive-light/5',
                      typeof onRowClick === 'function' && 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-olive',
                      resolveRowClassName(item, rowIndex)
                    )}
                    onClick={typeof onRowClick === 'function' ? () => onRowClick(item, rowIndex) : undefined}
                    onKeyDown={
                      typeof onRowClick === 'function'
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              onRowClick(item, rowIndex)
                            }
                          }
                        : undefined
                    }
                    role={typeof onRowClick === 'function' ? 'button' : undefined}
                    tabIndex={typeof onRowClick === 'function' ? 0 : undefined}
                  >
                    {columns.map((column) => {
                      const columnKey = getColumnKey(column)
                      return (
                        <td
                          key={columnKey}
                          className={cn(
                            'px-4 py-3 text-sm text-text-dark',
                            column.cellClassName
                          )}
                        >
                          {renderColumnValue(column, item, rowIndex)}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4 sm:hidden">
        {data.length === 0 ? (
          <div className="rounded-lg border border-olive-light/40 bg-white px-4 py-6 text-center text-sm text-text-dark/60">
            {emptyMessage}
          </div>
        ) : (
          data.map((item, rowIndex) => (
            <div
              key={resolveRowKey(item, rowIndex)}
              className={cn(
                'rounded-lg border border-olive-light/40 bg-white p-4 shadow-sm',
                typeof onRowClick === 'function' && 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-olive',
                resolveRowClassName(item, rowIndex),
                mobileCardClassName
              )}
              onClick={typeof onRowClick === 'function' ? () => onRowClick(item, rowIndex) : undefined}
              onKeyDown={
                typeof onRowClick === 'function'
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onRowClick(item, rowIndex)
                      }
                    }
                  : undefined
              }
              role={typeof onRowClick === 'function' ? 'button' : undefined}
              tabIndex={typeof onRowClick === 'function' ? 0 : undefined}
            >
              {columns.map((column) => {
                if (column.hideOnMobile) {
                  return null
                }

                const columnKey = getColumnKey(column)
                const headerLabel = column.mobileHeader || column.header
                const value = renderColumnValue(column, item, rowIndex)

                return (
                  <div
                    key={columnKey}
                    className={cn('flex items-start justify-between gap-4 py-1', column.mobileRowClassName)}
                  >
                    <span className="text-xs font-medium uppercase tracking-wide text-text-dark/60">
                      {headerLabel}
                    </span>
                    <div
                      className={cn(
                        'text-sm text-text-dark text-right',
                        column.mobileValueClassName
                      )}
                    >
                      {column.mobileRender
                        ? column.mobileRender(item, rowIndex)
                        : value}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ResponsiveTable


