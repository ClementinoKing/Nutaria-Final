import { Fragment } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDailyChecks } from '@/context/DailyChecksContext'
import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

function DailyChecks() {
  const { categories, toggleItem, remainingCount, totalCount, completedCount, loading } = useDailyChecks()
  const allComplete = remainingCount === 0 && totalCount > 0

  return (
    <PageLayout
      title="Daily Checks"
      activeItem="daily-checks"
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Daily routine checklist</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tick off required plant checks as they are completed. Checks are saved for today in the database.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{completedCount}</span> of {totalCount} checks complete
          </div>
        </div>
      </div>

      {loading ? (
        <Card className="mb-6 border border-border bg-card">
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">Loading today&apos;s checks...</p>
          </CardContent>
        </Card>
      ) : null}

      {allComplete ? (
        <Card className="mb-8 border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-300">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">All daily checks complete</CardTitle>
            <CardDescription className="text-emerald-700 dark:text-emerald-200/80">
              Great work! Everything required for today has been signed off.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {categories.map((category) => (
          <Card key={category.id} className="border border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">{category.title}</CardTitle>
              <CardDescription className="text-muted-foreground">{category.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {category.items.map((item) => {
                  const Icon = item.completed ? CheckCircle2 : Circle
                  return (
                    <Fragment key={item.id}>
                      <button
                        type="button"
                        onClick={() => toggleItem(category.id, item.id)}
                        disabled={loading}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive',
                          item.completed
                            ? 'border-olive bg-olive/10 text-foreground'
                            : 'border-border bg-card text-foreground/90 hover:bg-muted/40'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-5 w-5 flex-shrink-0 transition-colors',
                            item.completed ? 'text-olive' : 'text-olive-light'
                          )}
                        />
                        <div>
                          <p className="font-semibold text-foreground">{item.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>
                        </div>
                      </button>
                    </Fragment>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageLayout>
  )
}

export default DailyChecks
