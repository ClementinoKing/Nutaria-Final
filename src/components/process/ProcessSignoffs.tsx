import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, User } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import type { ProcessSignoff } from '@/types/processExecution'

interface ProcessSignoffsProps {
  lotRunId: number
  signoffs: ProcessSignoff[]
  onSign: (role: ProcessSignoff['role']) => Promise<void>
  loading?: boolean
}

const ROLE_LABELS: Record<ProcessSignoff['role'], string> = {
  operator: 'Operator',
  supervisor: 'Supervisor',
  qa: 'QA',
}

export function ProcessSignoffs({
  lotRunId,
  signoffs,
  onSign,
  loading = false,
}: ProcessSignoffsProps) {
  const { user } = useAuth()
  const [userProfiles, setUserProfiles] = useState<Map<string, { full_name?: string; email?: string }>>(new Map())

  useEffect(() => {
    // Fetch user profiles for signoffs
    const userIds = signoffs.map((s) => s.signed_by).filter(Boolean) as string[]
    if (userIds.length === 0) return

    supabase
      .from('user_profiles')
      .select('id, auth_user_id, full_name, email')
      .in('auth_user_id', userIds)
      .then(({ data, error }) => {
        if (!error && data) {
          const map = new Map<string, { full_name?: string; email?: string }>()
          data.forEach((profile) => {
            if (profile.auth_user_id) {
              map.set(profile.auth_user_id, {
                full_name: profile.full_name ?? undefined,
                email: profile.email ?? undefined,
              })
            }
          })
          setUserProfiles(map)
        }
      })
  }, [signoffs])

  const handleSign = async (role: ProcessSignoff['role']) => {
    if (!user?.id) {
      toast.error('You must be logged in to sign off')
      return
    }

    try {
      await onSign(role)
    } catch (error) {
      console.error('Error recording signoff:', error)
      toast.error('Failed to record signoff')
    }
  }

  const getSignoffsByRole = (role: ProcessSignoff['role']) => {
    return signoffs.filter((s) => s.role === role)
  }

  const hasSigned = (role: ProcessSignoff['role']) => {
    return getSignoffsByRole(role).some((s) => s.signed_by === user?.id)
  }

  const getUserDisplayName = (signedBy: string) => {
    const profile = userProfiles.get(signedBy)
    return profile?.full_name || profile?.email || signedBy
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-text-dark">Process Signoffs</h4>

      <div className="grid gap-4 sm:grid-cols-3">
        {(['operator', 'supervisor', 'qa'] as const).map((role) => {
          const roleSignoffs = getSignoffsByRole(role)
          const userHasSigned = hasSigned(role)

          return (
            <div
              key={role}
              className="rounded-lg border border-olive-light/30 bg-white p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-text-dark/60" />
                  <span className="text-sm font-semibold text-text-dark">{ROLE_LABELS[role]}</span>
                </div>
                {userHasSigned && (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
              </div>

              {roleSignoffs.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {roleSignoffs.map((signoff) => (
                    <div key={signoff.id} className="text-xs text-text-dark/70">
                      <div className="font-medium">{getUserDisplayName(signoff.signed_by)}</div>
                      <div>{new Date(signoff.signed_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-dark/50 mb-3">No signoffs yet</p>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSign(role)}
                disabled={loading || userHasSigned}
                className="w-full border-olive-light/30"
              >
                {userHasSigned ? 'Signed' : `Sign as ${ROLE_LABELS[role]}`}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
