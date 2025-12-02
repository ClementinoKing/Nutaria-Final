import { useEffect, useMemo, useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Layers,
  ShieldCheck,
  Plus,
  Users as UsersIcon,
  Filter,
  Settings2,
  ClipboardList
} from 'lucide-react'
import { toast } from 'sonner'
import { useUserProfiles } from '@/hooks/useUserProfiles'
import { ROLE_OPTIONS, ROLE_CAPABILITY_MATRIX } from '@/constants/roles'

interface NewRoleState {
  name: string
  description: string
  capabilities: string[]
  permissions: string[]
}

function RoleManagement() {
  const [focusArea, setFocusArea] = useState('ALL')
  const [roleSearch, setRoleSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newRole, setNewRole] = useState<NewRoleState>({
    name: '',
    description: '',
    capabilities: [],
    permissions: ['']
  })
  const { profiles, loading, error, refresh } = useUserProfiles()

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? 'Unable to load role data from Supabase.')
    }
  }, [error])

  const resetForm = () => {
    setNewRole({
      name: '',
      description: '',
      capabilities: [],
      permissions: ['']
    })
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    resetForm()
  }

  const toggleCapability = (capability: string) => {
    setNewRole((prev) => {
      const exists = prev.capabilities.includes(capability)
      return {
        ...prev,
        capabilities: exists
          ? prev.capabilities.filter((item) => item !== capability)
          : [...prev.capabilities, capability],
      }
    })
  }

  const updatePermission = (index: number, value: string) => {
    setNewRole((prev) => {
      const updated = [...prev.permissions]
      updated[index] = value
      return { ...prev, permissions: updated }
    })
  }

  const addPermissionField = () => {
    setNewRole((prev) => ({ ...prev, permissions: [...prev.permissions, ''] }))
  }

  const removePermissionField = (index: number) => {
    setNewRole((prev) => {
      const updated = prev.permissions.filter((_, idx) => idx !== index)
      return { ...prev, permissions: updated.length > 0 ? updated : [''] }
    })
  }

  const roleCounts = useMemo(() => {
    return profiles.reduce((accumulator: Record<string, number>, profile) => {
      const key = String(profile.role ?? 'viewer')
      accumulator[key] = (accumulator[key] ?? 0) + 1
      return accumulator
    }, {} as Record<string, number>)
  }, [profiles])

  const enrichedRoles = useMemo(() => {
    return ROLE_OPTIONS.map((role) => ({
      ...role,
      members: roleCounts[role.value] ?? 0
    }))
  }, [roleCounts])

  const roleSummary = useMemo(() => {
    const total = ROLE_OPTIONS.length
    const usersCovered = profiles.length
    const activeRoles = enrichedRoles.filter((role) => role.members > 0).length

    return { total, usersCovered, activeRoles }
  }, [enrichedRoles, profiles.length])

  const filteredRoles = useMemo(() => {
    const trimmedSearch = roleSearch.trim().toLowerCase()
    return enrichedRoles.filter((role) => {
      const matchesSearch =
        trimmedSearch.length === 0 ||
        role.label.toLowerCase().includes(trimmedSearch) ||
        role.description.toLowerCase().includes(trimmedSearch)

      const matchesArea =
        focusArea === 'ALL' || role.capabilities.some((capability) => capability === focusArea)

      return matchesSearch && matchesArea
    })
  }, [enrichedRoles, focusArea, roleSearch])

  const focusAreas = useMemo(() => {
    const uniqueCapabilities = new Set(ROLE_OPTIONS.flatMap((role) => role.capabilities))
    return ['ALL', ...Array.from(uniqueCapabilities)]
  }, [])

  const availableCapabilities = focusAreas.filter((area) => area !== 'ALL')

  const accessInsights = useMemo(() => {
    const largestRole = enrichedRoles.length > 0
      ? enrichedRoles.reduce(
          (current, role) => (role.members > current.members ? role : current),
          enrichedRoles[0]!
        )
      : null

    return [
      {
        label: 'Active Role Coverage',
        value: `${roleSummary.activeRoles}/${ROLE_OPTIONS.length}`,
        delta: `${profiles.length} members`,
        helper: 'Roles with at least one assigned Supabase profile',
        icon: ClipboardList
      },
      {
        label: 'Largest Team',
        value: largestRole ? largestRole.label : '—',
        delta: `${largestRole?.members ?? 0} members`,
        helper: 'Role with highest membership count',
        icon: UsersIcon
      },
      {
        label: 'Administrator Seats',
        value: `${roleCounts.admin ?? 0}`,
        delta: 'Monitor least-privilege posture',
        helper: 'Admin profiles with full system access',
        icon: ShieldCheck
      }
    ]
  }, [enrichedRoles, profiles.length, roleCounts, roleSummary.activeRoles])

  return (
    <PageLayout
      title="Role Management"
      activeItem="users"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const { error: refreshError } = await refresh()
              if (refreshError) {
                toast.error(refreshError.message ?? 'Failed to refresh role assignments')
              } else {
                toast.success('Role assignments refreshed')
              }
            }}
            disabled={loading}
          >
            <Filter className="mr-2 h-4 w-4" />
            Refresh data
          </Button>
          <Button size="sm" variant="outline">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Audit Permissions
          </Button>
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Role
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        <Card className="border-none bg-gradient-to-r from-olive-dark/90 via-olive to-olive-light/80 text-white">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-2xl font-semibold">Design your access model</CardTitle>
              <CardDescription className="text-white/80">
                Align Nutaria teams to the right capabilities and keep permissions auditable with a
                modern, principle-of-least-privilege approach.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3">
              <Settings2 className="h-10 w-10 flex-shrink-0 rounded-full bg-white/20 p-2 text-white" />
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-white/70">
                  Current posture
                </p>
                <p className="text-lg font-semibold">Trusted</p>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-olive-light/40 bg-white">
            <CardHeader className="pb-3">
              <CardTitle>Total Roles</CardTitle>
              <CardDescription>Covering key operational domains</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-text-dark">{roleSummary.total}</p>
            </CardContent>
          </Card>
          <Card className="border-olive-light/40 bg-white">
            <CardHeader className="pb-3">
              <CardTitle>Users Assigned</CardTitle>
              <CardDescription>Team members with mapped access</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-olive">{roleSummary.usersCovered}</p>
            </CardContent>
          </Card>
          <Card className="border-olive-light/40 bg-white">
            <CardHeader className="pb-3">
              <CardTitle>Active Roles</CardTitle>
              <CardDescription>Roles currently assigned to teammates</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-text-dark">{roleSummary.activeRoles}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-olive-light/50 bg-white">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-lg">Role Catalogue</CardTitle>
                <CardDescription>
                  Curated views of the capabilities and permissions assigned to each Nutaria role.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <Label htmlFor="role-search" className="text-xs uppercase tracking-wide text-text-dark/60">
                    Search
                  </Label>
                  <Input
                    id="role-search"
                    value={roleSearch}
                    onChange={(event) => setRoleSearch(event.target.value)}
                    placeholder="Search roles or descriptions"
                    className="w-full sm:w-64"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="focus-area" className="text-xs uppercase tracking-wide text-text-dark/60">
                    Focus area
                  </Label>
                  <div className="relative">
                    <select
                      id="focus-area"
                      value={focusArea}
                      onChange={(event) => setFocusArea(event.target.value)}
                      className="flex h-10 items-center rounded-md border border-input bg-background px-10 pr-8 text-sm text-text-dark shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2"
                    >
                      {focusAreas.map((area) => (
                        <option key={area} value={area}>
                          {area === 'ALL' ? 'All capabilities' : area}
                        </option>
                      ))}
                    </select>
                    <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dark/60" />
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center px-4 py-16 text-sm text-text-dark/60">
                Loading role assignments…
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-olive-light/50 bg-olive-light/20 py-12">
                <Layers className="h-10 w-10 text-olive" />
                <p className="text-sm text-text-dark/70">
                  No roles found for the current filters. Try clearing your search or switching the
                  capability filter.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredRoles.map((role) => (
                  <Card key={role.value} className="border border-olive-light/40">
                    <CardHeader className="flex flex-col gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-olive/10">
                          <Layers className="h-5 w-5 text-olive" />
                        </div>
                        <div>
                          <CardTitle className="text-lg text-text-dark">{role.label}</CardTitle>
                          <CardDescription>{role.description}</CardDescription>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {role.capabilities.map((capability) => (
                          <span
                            key={capability}
                            className="inline-flex items-center rounded-full border border-olive-light/60 bg-olive-light/20 px-3 py-1 text-xs font-medium uppercase tracking-wide text-text-dark/70"
                          >
                            {capability}
                          </span>
                        ))}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between rounded-lg bg-olive-light/10 px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-text-dark/70">
                          <UsersIcon className="h-4 w-4 text-olive" />
                          {role.members} team member{role.members === 1 ? '' : 's'}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="secondary">
                            Edit Role
                          </Button>
                          <Button size="sm" variant="ghost">
                            View Members
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-text-dark/60">
                          Key permissions
                        </p>
                        <ul className="grid gap-3">
                          {role.permissions.map((permission) => (
                            <li
                              key={permission}
                              className="rounded-lg border border-olive-light/50 bg-white px-4 py-3 text-sm text-text-dark/80 shadow-sm"
                            >
                              {permission}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-olive-light/50 bg-white">
          <CardHeader>
            <CardTitle className="text-lg">Permission Coverage Matrix</CardTitle>
            <CardDescription>
              Visualise how each role engages with Nutaria modules to identify overlaps or gaps.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full divide-y divide-olive-light/50">
              <thead className="bg-olive-light/30 text-left text-xs font-medium uppercase tracking-wide text-text-dark/70">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Capability Area
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Detail
                  </th>
                  {ROLE_OPTIONS.map((role) => (
                    <th key={role.value} scope="col" className="px-4 py-3">
                      {role.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-olive-light/40 text-sm text-text-dark/80">
                {ROLE_CAPABILITY_MATRIX.map((row) => (
                  <tr key={row.area} className="hover:bg-olive-light/10">
                    <td className="px-4 py-3 font-medium text-text-dark">{row.area}</td>
                    <td className="px-4 py-3 text-text-dark/70">{row.description}</td>
                  {ROLE_OPTIONS.map((role) => {
                    const level = row.access[role.value as keyof typeof row.access] ?? 'None'
                      const color =
                        level === 'Full'
                          ? 'bg-emerald-100 text-emerald-700'
                          : level === 'Edit'
                            ? 'bg-blue-100 text-blue-700'
                            : level === 'View'
                              ? 'bg-amber-100 text-amber-700'
                              : level === 'Request'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-gray-100 text-gray-600'
                      return (
                      <td key={role.value} className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${color}`}>
                            {level}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="border border-olive-light/50 bg-white">
          <CardHeader>
            <CardTitle className="text-lg">Access Insights</CardTitle>
            <CardDescription>
              Track how disciplined access management supports Nutaria’s governance posture.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {accessInsights.map((insight) => {
                const Icon = insight.icon
                return (
                  <div
                    key={insight.label}
                    className="flex flex-col gap-3 rounded-xl border border-olive-light/40 bg-olive-light/20 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white">
                        <Icon className="h-5 w-5 text-olive" />
                      </span>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-text-dark/60">
                          {insight.label}
                        </p>
                        <p className="text-lg font-semibold text-text-dark">{insight.value}</p>
                      </div>
                    </div>
                    <p className="text-sm text-text-dark/70">{insight.helper}</p>
                    <span className="text-xs font-medium text-olive">{insight.delta} vs prior period</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/40 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-text-dark">Create Role</h2>
                <p className="text-sm text-text-dark/70">
                  Define a capability set and permissions for a new Nutaria role.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleCloseModal}>
                Cancel
              </Button>
            </div>
            <form
              className="space-y-6 bg-beige/10 px-6 py-6"
              onSubmit={(event) => {
                event.preventDefault()
                // Future implementation: persist new role
                handleCloseModal()
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="role-name">Role name</Label>
                  <Input
                    id="role-name"
                    placeholder="e.g. Compliance Lead"
                    value={newRole.name}
                    onChange={(event) => setNewRole((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role-description">Short description</Label>
                  <Input
                    id="role-description"
                    placeholder="Describe the scope of this role"
                    value={newRole.description}
                    onChange={(event) =>
                      setNewRole((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-olive-light/40 bg-white p-4">
                <div className="flex flex-col gap-1">
                  <Label className="text-sm font-medium text-text-dark">Capabilities</Label>
                  <p className="text-xs text-text-dark/60">
                    Select the operational areas this role should be responsible for.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {availableCapabilities.map((capability) => {
                    const isActive = newRole.capabilities.includes(capability)
                    return (
                      <button
                        key={capability}
                        type="button"
                        onClick={() => toggleCapability(capability)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide transition ${
                          isActive
                            ? 'border-olive bg-olive text-white shadow-sm'
                            : 'border-olive-light/60 bg-olive-light/20 text-text-dark/70 hover:border-olive'
                        }`}
                      >
                        {capability}
                      </button>
                    )
                  })}
                  {availableCapabilities.length === 0 && (
                    <span className="text-xs text-text-dark/60">
                      No capability tags available yet. They will appear once roles define them.
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-olive-light/40 bg-white p-4">
                <div className="flex flex-col gap-1">
                  <Label className="text-sm font-medium text-text-dark">Key permissions</Label>
                  <p className="text-xs text-text-dark/60">
                    Provide explicit permissions or actions this role can perform.
                  </p>
                </div>
                <div className="space-y-2">
                  {newRole.permissions.map((permission, index) => (
                    <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        placeholder="e.g. Approve supplier onboarding"
                        value={permission}
                        onChange={(event) => updatePermission(index, event.target.value)}
                        className="flex-1"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removePermissionField(index)}
                          disabled={newRole.permissions.length === 1}
                        >
                          Remove
                        </Button>
                        {index === newRole.permissions.length - 1 && (
                          <Button type="button" variant="secondary" size="sm" onClick={addPermissionField}>
                            Add
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-olive-light/40 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-olive hover:bg-olive-dark">
                  Create Role
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default RoleManagement


