import { useEffect, useMemo, useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Pencil, RotateCcw, Trash2, UserPlus, X, Users as UsersIcon } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useUserProfiles } from '@/hooks/useUserProfiles'
import { ROLE_OPTIONS } from '@/constants/roles'
import { classifyIdentifier, phoneToUsernameEmail, usernameToAuthEmail } from '@/lib/authIdentifier'
import { normalizeRoleName } from '@/constants/roles'

interface RoleRow {
  id: string
  name: string
  description: string | null
}

interface UserRoleRow {
  user_id: string
  role_id: string
}

interface UserProfileRow {
  id: string
  auth_user_id: string
  full_name: string | null
  email: string | null
  role: string | null
  deleted_at: string | null
  created_at: string | null
}

function formatDate(value: string | Date | number | null | undefined) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function UserManagement() {
  const { profiles, loading, refresh, setProfiles } = useUserProfiles()
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [roleAssignments, setRoleAssignments] = useState<UserRoleRow[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<UserProfileRow | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [password, setPassword] = useState('')
  const [formState, setFormState] = useState({
    fullName: '',
    identifier: '',
    roleName: 'Operator',
  })

  const loadAccessData = async () => {
    const [rolesResult, assignmentsResult] = await Promise.all([
      supabase.from('roles').select('id, name, description').order('name', { ascending: true }),
      supabase.from('user_roles').select('user_id, role_id'),
    ])

    if (rolesResult.error) {
      toast.error(rolesResult.error.message ?? 'Unable to load roles')
      return
    }

    if (assignmentsResult.error) {
      toast.error(assignmentsResult.error.message ?? 'Unable to load role assignments')
      return
    }

    setRoles((rolesResult.data ?? []) as RoleRow[])
    setRoleAssignments((assignmentsResult.data ?? []) as UserRoleRow[])
  }

  useEffect(() => {
    void loadAccessData()
  }, [])

  const roleById = useMemo(() => {
    return new Map(roles.map((role) => [role.id, role]))
  }, [roles])

  const profileRoleMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const assignment of roleAssignments) {
      const role = roleById.get(assignment.role_id)
      if (role) {
        map.set(assignment.user_id, role.name)
      }
    }
    return map
  }, [roleAssignments, roleById])

  const enrichedProfiles = useMemo(() => {
    return (profiles as UserProfileRow[]).map((profile) => ({
      ...profile,
      resolved_role: profileRoleMap.get(profile.auth_user_id) ?? normalizeRoleName(profile.role) ?? 'Operator',
    }))
  }, [profiles, profileRoleMap])

  const roleCounts = useMemo(() => {
    return enrichedProfiles.reduce((accumulator: Record<string, number>, profile) => {
      const key = String(profile.resolved_role ?? 'Operator')
      accumulator[key] = (accumulator[key] ?? 0) + 1
      return accumulator
    }, {})
  }, [enrichedProfiles])

  const filteredUsers = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase()
    if (!normalized) return enrichedProfiles

    return enrichedProfiles.filter((profile) => {
      return (
        String(profile.full_name ?? '').toLowerCase().includes(normalized) ||
        String(profile.email ?? '').toLowerCase().includes(normalized) ||
        String(profile.resolved_role ?? '').toLowerCase().includes(normalized)
      )
    })
  }, [enrichedProfiles, searchTerm])

  const resetForm = () => {
    setFormState({
      fullName: '',
      identifier: '',
      roleName: 'Operator',
    })
    setPassword('')
  }

  const handleCloseModal = () => {
    setSelectedProfile(null)
    setIsModalOpen(false)
    resetForm()
    setIsSubmitting(false)
  }

  const handleOpenModal = (profile: UserProfileRow | null) => {
    if (!profile) {
      setSelectedProfile(null)
      resetForm()
      setIsModalOpen(true)
      return
    }

    setSelectedProfile(profile)
    setFormState({
      fullName: profile.full_name ?? '',
      identifier: profile.email ?? '',
      roleName: profileRoleMap.get(profile.auth_user_id) ?? normalizeRoleName(profile.role) ?? 'Operator',
    })
    setPassword('')
    setIsModalOpen(true)
  }

  const refreshAll = async () => {
    const { error: profileError } = await refresh()
    await loadAccessData()

    if (profileError) {
      toast.error(profileError.message ?? 'Failed to refresh users')
      return
    }

    toast.success('User directory refreshed')
  }

  const syncUserRole = async (authUserId: string, roleName: string) => {
    const roleId = roles.find((role) => role.name === roleName)?.id
    if (!roleId) {
      throw new Error(`Role not found: ${roleName}`)
    }

    const { error: deleteError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', authUserId)

    if (deleteError) {
      throw deleteError
    }

    const { error: insertError } = await supabase.from('user_roles').insert({
      user_id: authUserId,
      role_id: roleId,
    })

    if (insertError) {
      throw insertError
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)

    const isEditing = selectedProfile != null
    const roleName = formState.roleName
    if (!roles.some((role) => role.name === roleName)) {
      toast.error('Please choose a valid role.')
      setIsSubmitting(false)
      return
    }

    const sanitizedIdentifier = formState.identifier.trim()
    if (!sanitizedIdentifier) {
      toast.error('Username, email, or phone is required.')
      setIsSubmitting(false)
      return
    }

    if (!isEditing && !password.trim()) {
      toast.error('Username, email, or phone and password are required to create a user')
      setIsSubmitting(false)
      return
    }

    const classified = classifyIdentifier(sanitizedIdentifier)
    if (!classified) {
      toast.error('Please enter a valid email, phone number, or username.')
      setIsSubmitting(false)
      return
    }

    const authEmailForSignup =
      classified.type === 'email'
        ? classified.value
        : classified.type === 'phone'
          ? phoneToUsernameEmail(classified.value)
          : usernameToAuthEmail(classified.value)

    if (!authEmailForSignup) {
      toast.error('Please enter a valid email, phone number, or username.')
      setIsSubmitting(false)
      return
    }

    const duplicateValue = classified.value

    const duplicateProfileQuery = supabase
      .from('user_profiles')
      .select('id, auth_user_id')
      .eq('email', duplicateValue)
    const { data: existingProfile, error: duplicateLookupError } = isEditing
      ? await duplicateProfileQuery.neq('id', selectedProfile.id).maybeSingle()
      : await duplicateProfileQuery.maybeSingle()

    if (duplicateLookupError) {
      toast.error(duplicateLookupError.message ?? 'Unable to validate this credential')
      setIsSubmitting(false)
      return
    }

    if (existingProfile) {
      toast.error('A user with this credential already exists.')
      setIsSubmitting(false)
      return
    }

    if (selectedProfile) {
      const payload = {
        full_name: formState.fullName.trim() || null,
        email: duplicateValue,
        role: roleName,
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

      try {
        await syncUserRole(selectedProfile.auth_user_id, roleName)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to sync role assignment'
        toast.error(message)
        setIsSubmitting(false)
        return
      }

      toast.success('User updated')
      setProfiles((previous) =>
        previous.map((profile) =>
          profile.id === selectedProfile.id ? { ...profile, ...payload } : profile
        )
      )
      await loadAccessData()
      handleCloseModal()
      return
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: authEmailForSignup,
      password: password.trim(),
      options: {
        data: {
          full_name: formState.fullName.trim() || null,
          role: roleName,
        },
      },
    })

    if (signUpError) {
      toast.error(signUpError.message ?? 'Unable to create user')
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
      email: duplicateValue,
      role: roleName,
    }

    const { data: insertedProfile, error: insertError } = await supabase
      .from('user_profiles')
      .insert(profilePayload)
      .select()
      .maybeSingle()

    if (insertError) {
      toast.error(insertError.message ?? 'User created but profile insertion failed')
      setIsSubmitting(false)
      return
    }

    try {
      await syncUserRole(authUserId, roleName)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create role assignment'
      toast.error(message)
      setIsSubmitting(false)
      return
    }

    toast.success('User created')
    if (insertedProfile) {
      setProfiles((previous) => [insertedProfile as UserProfileRow, ...previous])
    }
    await loadAccessData()
    handleCloseModal()
  }

  const performDelete = async (profile: UserProfileRow) => {
    setDeletingUserId(profile.id)

    const { error } = await supabase.rpc('soft_delete_user_profile', {
      p_profile_id: profile.id,
    })

    if (error) {
      toast.error(error.message ?? 'Unable to deactivate user')
      setDeletingUserId(null)
      return
    }

    toast.success('User deactivated')
    setProfiles((previous) => previous.filter((item) => item.id !== profile.id))
    await loadAccessData()
    setDeletingUserId(null)
  }

  const summaryCards = [
    {
      title: 'Total Users',
      value: enrichedProfiles.length,
      helper: 'Provisioned across Supabase auth',
    },
    ...ROLE_OPTIONS.map((role) => ({
      title: role.label,
      value: roleCounts[role.value] ?? 0,
      helper: role.description,
    })),
  ]

  if (loading) {
    return (
      <PageLayout title="User Management" activeItem="users" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading users..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="User Management"
      activeItem="users"
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void refreshAll()}>
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
          {summaryCards.slice(0, 3).map((card) => (
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
                    Manage canonical RBAC role assignments for Nutaria teammates.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by name, credential, or role"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full sm:max-w-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-olive-light/40">
              {filteredUsers.length === 0 ? (
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
                        Credential
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
                    {filteredUsers.map((profile) => (
                      <tr key={profile.id} className="hover:bg-olive-light/10">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-text-dark">{profile.full_name || '—'}</span>
                            <span className="text-xs text-text-dark/60">Auth ID: {profile.auth_user_id}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{profile.email ?? '—'}</td>
                        <td className="px-4 py-3">{profile.resolved_role}</td>
                        <td className="px-4 py-3">{formatDate(profile.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleOpenModal(profile)}
                              aria-label={`Edit ${profile.full_name || profile.email || 'user'}`}
                              title="Edit user"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              disabled={deletingUserId === profile.id}
                              onClick={() => void performDelete(profile)}
                              aria-label={`Delete ${profile.full_name || profile.email || 'user'}`}
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {summaryCards.slice(3).map((card) => (
            <Card key={card.title}>
              <CardHeader>
                <CardTitle className="text-base">{card.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-text-dark">{card.value}</p>
                <p className="text-sm text-text-dark/70">{card.helper}</p>
              </CardContent>
            </Card>
          ))}
        </div>
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
                    ? 'Update the profile, credential, and canonical role assignment.'
                    : 'Provision a teammate with a username, email, or phone login and a temporary password.'}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleCloseModal} className="text-text-dark hover:bg-olive-light/10">
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
                    onChange={(event) => setFormState((previous) => ({ ...previous, fullName: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-role">Role</Label>
                  <select
                    id="user-role"
                    value={formState.roleName}
                    onChange={(event) => setFormState((previous) => ({ ...previous, roleName: event.target.value }))}
                    className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="identifier">Email, phone, or username</Label>
                  <Input
                    id="identifier"
                    value={formState.identifier}
                    onChange={(event) => setFormState((previous) => ({ ...previous, identifier: event.target.value }))}
                    placeholder="Enter an email, phone number, or username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Temporary password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Create a temporary password"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-olive-light/40 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : selectedProfile ? 'Update User' : 'Create User'}
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
