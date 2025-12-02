import { useEffect, useMemo, useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users as UsersIcon, Pencil, RotateCcw, Trash2, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useUserProfiles } from '@/hooks/useUserProfiles'
import { ROLE_OPTIONS } from '@/constants/roles'

const HIGHLIGHT_ROLES = ['admin', 'planner', 'qa']

function getRoleMeta(roleValue: string | null | undefined) {
  return ROLE_OPTIONS.find((role) => role.value === roleValue)
}

function formatDate(value: string | Date | number | null | undefined) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (error) {
    return '—'
  }
}

const REQUIRED_EMAIL_DOMAIN = '@nutaria.co.za'

function normalizeEmail(rawEmail: string) {
  const input = rawEmail.trim()
  if (!input) {
    return ''
  }

  const lowercase = input.toLowerCase()
  if (lowercase.endsWith(REQUIRED_EMAIL_DOMAIN)) {
    return input
  }

  const localPart = lowercase.includes('@') ? lowercase.split('@')[0] : lowercase
  return `${localPart}${REQUIRED_EMAIL_DOMAIN}`
}

function isValidNutariaEmail(email: string) {
  const pattern = /^[a-z0-9._%+-]+@nutaria\.co\.za$/i
  return pattern.test(email)
}

function UserManagement() {
  const { profiles, loading, error, refresh, setProfiles } = useUserProfiles()
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<{ [key: string]: unknown } | null>(null)
  const [formState, setFormState] = useState({ fullName: '', email: '', role: 'viewer' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [password, setPassword] = useState('')
  const [deletingUserId, setDeletingUserId] = useState<string | number | null>(null)

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? 'Unable to load team directory. Please try again.')
    }
  }, [error])

  const filteredUsers = useMemo(() => {
    const normalisedSearch = searchTerm.trim().toLowerCase()

    if (!normalisedSearch) {
      return profiles
    }

    return profiles.filter((profile) => {
      const roleMeta = getRoleMeta(profile.role as string | null | undefined)
      const roleLabel = roleMeta?.label ?? (profile.role as string | null | undefined) ?? ''
      return (
        (String(profile.full_name ?? '')).toLowerCase().includes(normalisedSearch) ||
        (String(profile.email ?? '')).toLowerCase().includes(normalisedSearch) ||
        roleLabel.toLowerCase().includes(normalisedSearch)
      )
    })
  }, [profiles, searchTerm])

  const roleCounts = useMemo(() => {
    return profiles.reduce((accumulator: Record<string, number>, profile) => {
      const key = String(profile.role ?? 'viewer')
      accumulator[key] = (accumulator[key] ?? 0) + 1
      return accumulator
    }, {} as Record<string, number>)
  }, [profiles])

  const summaryCards = useMemo(() => {
    return [
      {
        title: 'Total Users',
        value: profiles.length,
        helper: 'Provisioned across Supabase auth'
      },
      ...HIGHLIGHT_ROLES.map((roleValue) => {
        const roleMeta = getRoleMeta(roleValue)
    return {
          title: roleMeta?.label ?? roleValue,
          value: roleCounts[roleValue] ?? 0,
          helper: `${roleMeta?.label ?? 'Role'} members`
        }
      })
    ]
  }, [profiles.length, roleCounts])

  const handleRefresh = async () => {
    const { error: refreshError } = await refresh()
    if (refreshError) {
      toast.error(refreshError.message ?? 'Failed to refresh users')
    } else {
      toast.success('Team directory refreshed')
    }
  }

  const resetFormState = () => {
    setFormState({ fullName: '', email: '', role: 'viewer' })
    setPassword('')
  }

  const handleOpenModal = (profile: { [key: string]: unknown } | null) => {
    if (!profile) {
      setSelectedProfile(null)
      resetFormState()
      setIsModalOpen(true)
      return
    }

    setSelectedProfile(profile)
    setFormState({
      fullName: String(profile.full_name ?? ''),
      email: String(profile.email ?? ''),
      role: String(profile.role ?? 'viewer')
    })
    setPassword('')
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedProfile(null)
    resetFormState()
    setIsSubmitting(false)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)

    if (selectedProfile) {
      const payload = {
        full_name: formState.fullName.trim() || null,
      email: normalizeEmail(formState.email) || null,
        role: formState.role
      }

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update(payload)
        .eq('id', selectedProfile.id)

      if (updateError) {
        toast.error(updateError.message ?? 'Unable to update user')
        setIsSubmitting(false)
        return
      }

      toast.success('User profile updated')
      setProfiles((previous) =>
        previous.map((profile) => (profile.id === selectedProfile.id ? { ...profile, ...payload } : profile))
      )
      handleCloseModal()
      return
    }

    const sanitizedEmail = normalizeEmail(formState.email)
    if (!sanitizedEmail || !password.trim()) {
      toast.error('Email and password are required to create a user')
      setIsSubmitting(false)
      return
    }

    if (!isValidNutariaEmail(sanitizedEmail)) {
      toast.error('Please supply a Nutaria email username using letters, numbers, dots or dashes.')
      setIsSubmitting(false)
      return
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password: password.trim(),
      options: {
        data: {
          full_name: formState.fullName.trim() || null,
          role: formState.role
        }
      }
    })

    if (signUpError) {
      const message = signUpError.message?.toLowerCase() ?? ''

      if (message.includes('signups not allowed')) {
        toast.error(
          'Supabase signups are disabled for this project. Enable “Allow new users to sign up” in the Supabase Auth settings to proceed.'
        )
      } else if (signUpError.status === 422) {
        toast.error(
          signUpError.message ??
            'Supabase rejected the signup. Check if this email already exists or try a different password.'
        )
      } else {
        toast.error(signUpError.message ?? 'Unable to create user')
      }
      setIsSubmitting(false)
      return
    }

    const authUserId = signUpData.user?.id

    if (!authUserId) {
      toast.error('Supabase did not return a user id')
      setIsSubmitting(false)
      return
    }

    const profilePayload = {
      auth_user_id: authUserId,
      full_name: formState.fullName.trim() || null,
      email: sanitizedEmail,
      role: formState.role
    }

    const { error: insertError, data: insertedProfiles } = await supabase
      .from('user_profiles')
      .insert(profilePayload)
      .select()
      .maybeSingle()

    if (insertError) {
      toast.error(insertError.message ?? 'User created but profile insertion failed')
      setIsSubmitting(false)
      return
    }

    toast.success('User created and confirmed')
    if (insertedProfiles) {
      setProfiles((previous) => [insertedProfiles, ...previous])
    }
    handleCloseModal()
  }

  const handleDelete = async (profile: { [key: string]: unknown }) => {
    const roleMeta = getRoleMeta(profile.role as string | null | undefined)
    const displayName = String(profile.full_name || profile.email || profile.auth_user_id || '')

    const confirmDelete = window.confirm(
      `Remove ${displayName}? Their profile entry will be deleted immediately.`
    )

    if (!confirmDelete) {
      return
    }

    setDeletingUserId(profile.id as string | number | null)
    const { error: deleteError } = await supabase.from('user_profiles').delete().eq('id', profile.id)

    if (deleteError) {
      toast.error(deleteError.message ?? 'Unable to delete user profile')
      setDeletingUserId(null)
      return
    }

    toast.success(
      `${roleMeta?.label ?? 'User'} ${displayName} removed from Nutaria directory (Auth account remains active).`
    )
    setProfiles((previous) => previous.filter((item) => item.id !== profile.id))
    setDeletingUserId(null)
  }

  return (
    <PageLayout
      title="User Management"
      activeItem="users"
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={loading}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => handleOpenModal(null)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
        </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {summaryCards.map((card) => (
            <Card key={card.title}>
            <CardHeader>
                <CardTitle>{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-3xl font-semibold text-text-dark">{card.value}</p>
                <p className="text-sm text-text-dark/70">{card.helper}</p>
            </CardContent>
          </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-olive/10">
                  <UsersIcon className="h-5 w-5 text-olive" />
                </div>
                <div>
                  <CardTitle className="text-lg">Team Directory</CardTitle>
                  <p className="text-sm text-text-dark/60">
                    Manage access, roles, and onboarding for Nutaria teammates.
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Input
                placeholder="Search by name, email, or role"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full sm:max-w-sm"
              />
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-olive-light/40">
              {loading ? (
                <div className="flex items-center justify-center px-4 py-16 text-sm text-text-dark/60">
                  Loading users from Supabase…
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="flex items-center justify-center px-4 py-16 text-sm text-text-dark/60">
                  No users match your current filters.
                </div>
              ) : (
              <table className="min-w-full divide-y divide-olive-light/50 bg-white">
                <thead className="bg-olive-light/20 text-left text-xs font-medium uppercase tracking-wide text-text-dark/70">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      User
                    </th>
                      <th scope="col" className="px-4 py-3">
                        Email
                      </th>
                    <th scope="col" className="px-4 py-3">
                      Role
                    </th>
                    <th scope="col" className="px-4 py-3">
                        Created
                    </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-olive-light/40 text-sm text-text-dark/80">
                    {filteredUsers.map((profile) => {
                      const roleMeta = getRoleMeta(profile.role as string | null | undefined)
                      return (
                        <tr key={String(profile.id ?? '')} className="hover:bg-olive-light/10">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                              <span className="font-medium text-text-dark">
                                {String(profile.full_name || '—')}
                              </span>
                              <span className="text-xs text-text-dark/60">
                                Auth ID: {String(profile.auth_user_id ?? '')}
                              </span>
                          </div>
                        </td>
                          <td className="px-4 py-3">{String(profile.email ?? '—')}</td>
                          <td className="px-4 py-3">{roleMeta?.label ?? String(profile.role ?? '—')}</td>
                          <td className="px-4 py-3">{formatDate(profile.created_at as string | Date | number | null | undefined)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-olive hover:text-olive-dark"
                                onClick={() => handleOpenModal(profile)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700"
                                disabled={deletingUserId === profile.id}
                                onClick={() => handleDelete(profile)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {deletingUserId === profile.id ? 'Deleting…' : 'Delete'}
                              </Button>
                            </div>
                        </td>
                      </tr>
                      )
                    })}
                </tbody>
              </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-text-dark">
                  {selectedProfile ? 'Edit User' : 'Create User'}
                </h2>
                <p className="text-sm text-text-dark/70">
                  {selectedProfile
                    ? 'Update profile information or adjust the assigned role.'
                    : 'Provision a new teammate with an initial role and temporary password.'}
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
            <form className="space-y-6 bg-beige/10 px-6 py-6" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="user-name">Full Name</Label>
                  <Input
                    id="user-name"
                    value={formState.fullName}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, fullName: event.target.value }))
                    }
                    placeholder="Jane Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-email">Email Address</Label>
                  <div className="relative">
                  <Input
                    id="user-email"
                      type="text"
                    value={formState.email}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, email: event.target.value }))
                      }
                      placeholder="jane.doe"
                      className="pr-32"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-text-dark/60">
                      @nutaria.co.za
                    </span>
                  </div>
                  <p className="text-[11px] text-text-dark/60">
                    Enter only the username; the Nutaria domain is appended automatically.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="user-role">Role</Label>
                  <select
                    id="user-role"
                    value={formState.role}
                    onChange={(event) => setFormState((prev) => ({ ...prev, role: event.target.value }))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedProfile ? (
                  <div className="space-y-2">
                    <Label htmlFor="auth-id">Supabase Auth ID</Label>
                    <Input id="auth-id" value={String(selectedProfile.auth_user_id ?? '')} disabled />
                  </div>
                ) : (
                <div className="space-y-2">
                    <Label htmlFor="user-password">Password</Label>
                    <Input
                      id="user-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Generate a secure password"
                    />
                </div>
                )}
              </div>
              {!selectedProfile && (
                <div className="rounded-md bg-olive-light/30 px-3 py-2 text-xs text-text-dark/70">
                  New users are automatically confirmed and can sign in immediately with the temporary password.
                </div>
              )}
              <div className="flex justify-end gap-3 border-t border-olive-light/30 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-olive hover:bg-olive-dark" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : selectedProfile ? 'Save Changes' : 'Create User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default UserManagement


