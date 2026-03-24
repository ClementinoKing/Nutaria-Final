import { useEffect, useMemo, useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BadgeCheck, CheckCircle2, ClipboardList, Filter, Layers, Plus, ShieldCheck, Users as UsersIcon } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'
import { ROLE_OPTIONS, normalizeRoleName } from '@/constants/roles'

interface RoleRow {
  id: string
  name: string
  description: string | null
  created_at: string
}

interface PermissionRow {
  id: string
  key: string
  description: string | null
  module: string
}

interface RolePermissionRow {
  role_id: string
  permission_id: string
}

interface NewRoleState {
  name: string
  description: string
}

function RoleManagement() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [rolePermissions, setRolePermissions] = useState<RolePermissionRow[]>([])
  const [roleMembers, setRoleMembers] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [roleSearch, setRoleSearch] = useState('')
  const [focusArea, setFocusArea] = useState('ALL')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newRole, setNewRole] = useState<NewRoleState>({
    name: '',
    description: '',
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const [rolesResult, permissionsResult, rolePermissionsResult, userRolesResult] = await Promise.all([
        supabase.from('roles').select('id, name, description, created_at').order('name', { ascending: true }),
        supabase.from('permissions').select('id, key, description, module').order('module', { ascending: true }).order('key', { ascending: true }),
        supabase.from('role_permissions').select('role_id, permission_id'),
        supabase.rpc('get_role_member_counts'),
      ])

      if (rolesResult.error) throw rolesResult.error
      if (permissionsResult.error) throw permissionsResult.error
      if (rolePermissionsResult.error) throw rolePermissionsResult.error
      if (userRolesResult.error) throw userRolesResult.error

      setRoles((rolesResult.data ?? []) as RoleRow[])
      setPermissions((permissionsResult.data ?? []) as PermissionRow[])
      setRolePermissions((rolePermissionsResult.data ?? []) as RolePermissionRow[])
      const countsPayload = (userRolesResult.data as Record<string, number> | null) ?? {}
      setRoleMembers(
        Object.fromEntries(
          Object.entries(countsPayload).map(([roleId, count]) => [roleId, Number(count) || 0])
        )
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load role data'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const permissionById = useMemo(() => {
    return new Map(permissions.map((permission) => [permission.id, permission]))
  }, [permissions])

  const permissionsByRole = useMemo(() => {
    const map = new Map<string, PermissionRow[]>()
    for (const role of roles) {
      map.set(role.id, [])
    }

    for (const mapping of rolePermissions) {
      const permission = permissionById.get(mapping.permission_id)
      if (!permission) continue
      if (!map.has(mapping.role_id)) {
        map.set(mapping.role_id, [])
      }
      map.get(mapping.role_id)!.push(permission)
    }

    return map
  }, [permissionById, rolePermissions, roles])

  const roleAreas = useMemo(() => {
    const areas = new Set(permissions.map((permission) => permission.module))
    return ['ALL', ...Array.from(areas).sort()]
  }, [permissions])

  const filteredRoles = useMemo(() => {
    const normalizedSearch = roleSearch.trim().toLowerCase()
    return roles.filter((role) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        role.name.toLowerCase().includes(normalizedSearch) ||
        (role.description ?? '').toLowerCase().includes(normalizedSearch)

      const rolePermissionKeys = permissionsByRole.get(role.id)?.map((permission) => permission.key) ?? []
      const matchesArea =
        focusArea === 'ALL' || permissions.some((permission) => rolePermissionKeys.includes(permission.key) && permission.module === focusArea)

      return matchesSearch && matchesArea
    })
  }, [focusArea, permissions, permissionsByRole, roleSearch, roles])

  const roleSummary = useMemo(() => {
    return {
      totalRoles: roles.length,
      totalPermissions: permissions.length,
      activeRoles: roles.filter((role) => (roleMembers[role.id] ?? 0) > 0).length,
    }
  }, [roleMembers, permissions.length, roles])

  const availableRoles = useMemo(() => {
    return ROLE_OPTIONS.map((roleOption) => {
      const dbRole = roles.find((role) => role.name === roleOption.value)
      const memberCount = dbRole ? (roleMembers[dbRole.id] ?? 0) : 0

      return {
        ...roleOption,
        id: dbRole?.id ?? null,
        description: dbRole?.description ?? roleOption.description,
        memberCount,
        permissionCount: roleOption.permissions.length,
      }
    })
  }, [roleMembers, roles])

  const moduleGroups = useMemo(() => {
    const grouped = new Map<string, PermissionRow[]>()
    permissions.forEach((permission) => {
      if (!grouped.has(permission.module)) {
        grouped.set(permission.module, [])
      }
      grouped.get(permission.module)!.push(permission)
    })
    return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right))
  }, [permissions])

  const permissionIdsForRole = (roleId: string) => new Set((rolePermissions.filter((entry) => entry.role_id === roleId)).map((entry) => entry.permission_id))

  const togglePermission = async (roleId: string, permissionId: string) => {
    const assigned = permissionIdsForRole(roleId).has(permissionId)
    if (assigned) {
      const { error } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId)
        .eq('permission_id', permissionId)
      if (error) {
        toast.error(error.message ?? 'Unable to revoke permission')
        return
      }
      setRolePermissions((previous) => previous.filter((entry) => !(entry.role_id === roleId && entry.permission_id === permissionId)))
      toast.success('Permission revoked')
      return
    }

    const { error } = await supabase.from('role_permissions').insert({
      role_id: roleId,
      permission_id: permissionId,
    })

    if (error) {
      toast.error(error.message ?? 'Unable to grant permission')
      return
    }

    setRolePermissions((previous) => [...previous, { role_id: roleId, permission_id: permissionId }])
    toast.success('Permission granted')
  }

  const createRole = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = newRole.name.trim()
    if (!trimmedName) {
      toast.error('Role name is required')
      return
    }

    const { error } = await supabase.from('roles').insert({
      name: trimmedName,
      description: newRole.description.trim() || null,
    })

    if (error) {
      toast.error(error.message ?? 'Unable to create role')
      return
    }

    toast.success('Role created')
    setIsModalOpen(false)
    setNewRole({ name: '', description: '' })
    await loadData()
  }

  if (loading) {
    return (
      <PageLayout title="Role Management" activeItem="users" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading roles..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Role Management"
      activeItem="users"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void loadData()}>
            <Filter className="mr-2 h-4 w-4" />
            Refresh data
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
                Manage RBAC roles and permissions directly from the database-backed access model.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3">
              <ShieldCheck className="h-10 w-10 flex-shrink-0 rounded-full bg-white/20 p-2 text-white" />
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-white/70">Current posture</p>
                <p className="text-lg font-semibold">Permission-first</p>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="border border-olive-light/50 bg-white">
          <CardHeader className="gap-2">
            <CardTitle className="text-lg">Available Roles</CardTitle>
            <CardDescription>
              Every canonical role in the system and the permissions it includes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {availableRoles.map((role) => (
                <div key={role.value} className="flex h-full flex-col rounded-xl border border-olive-light/40 bg-olive-light/10 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-text-dark">{role.label}</p>
                      <p className="mt-1 text-sm text-text-dark/70">{role.description}</p>
                    </div>
                    <div className="rounded-full bg-olive px-3 py-1 text-xs font-semibold text-white">
                      {role.memberCount} users
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {role.capabilities.map((capability) => (
                      <span
                        key={capability}
                        className="rounded-full border border-olive-light/60 bg-white px-3 py-1 text-xs font-medium text-text-dark"
                      >
                        {capability}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-text-dark">
                      <CheckCircle2 className="h-4 w-4 text-olive" />
                      Includes {role.permissionCount} permission{role.permissionCount === 1 ? '' : 's'}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {role.permissions.map((permission) => (
                        <span
                          key={permission}
                          className="rounded-md bg-white px-2.5 py-1 text-xs text-text-dark/80 shadow-sm"
                        >
                          {permission}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-olive-light/40 bg-white">
            <CardHeader className="pb-3">
              <CardTitle>Total Roles</CardTitle>
              <CardDescription>Canonical roles in the database</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-text-dark">{roleSummary.totalRoles}</p>
            </CardContent>
          </Card>
          <Card className="border-olive-light/40 bg-white">
            <CardHeader className="pb-3">
              <CardTitle>Total Permissions</CardTitle>
              <CardDescription>Scoped capability keys available</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-olive">{roleSummary.totalPermissions}</p>
            </CardContent>
          </Card>
          <Card className="border-olive-light/40 bg-white">
            <CardHeader className="pb-3">
              <CardTitle>Active Roles</CardTitle>
              <CardDescription>Roles currently assigned to at least one user</CardDescription>
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
                <CardDescription>View and update role permission mappings.</CardDescription>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
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
                  <select
                    id="focus-area"
                    value={focusArea}
                    onChange={(event) => setFocusArea(event.target.value)}
                    className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-text-dark shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2"
                  >
                    {roleAreas.map((area) => (
                      <option key={area} value={area}>
                        {area === 'ALL' ? 'All modules' : area}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {filteredRoles.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-olive-light/50 bg-olive-light/20 py-12">
                <Layers className="h-10 w-10 text-olive" />
                <p className="text-sm text-text-dark/70">No roles found for the current filters.</p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredRoles.map((role) => {
                  const rolePermissionIds = permissionIdsForRole(role.id)
                  const memberCount = roleMembers[role.id] ?? 0
                  return (
                    <Card key={role.id} className="border border-olive-light/40">
                      <CardHeader className="space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-olive/10">
                            <BadgeCheck className="h-5 w-5 text-olive" />
                          </div>
                          <div>
                            <CardTitle className="text-lg text-text-dark">{role.name}</CardTitle>
                            <CardDescription>{role.description ?? 'No description provided.'}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-text-dark/70">
                          <UsersIcon className="h-4 w-4 text-olive" />
                          {memberCount} team member{memberCount === 1 ? '' : 's'}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {moduleGroups.map(([moduleName, modulePermissions]) => {
                          const visiblePermissions = modulePermissions.filter((permission) => {
                            if (focusArea !== 'ALL' && focusArea !== moduleName) return false
                            return true
                          })

                          if (visiblePermissions.length === 0) return null

                          return (
                            <div key={moduleName} className="space-y-2 rounded-lg border border-olive-light/40 bg-olive-light/10 p-4">
                              <div className="flex items-center gap-2">
                                <ClipboardList className="h-4 w-4 text-olive" />
                                <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">{moduleName}</p>
                              </div>
                              <div className="grid gap-2">
                                {visiblePermissions.map((permission) => {
                                  const assigned = rolePermissionIds.has(permission.id)
                                  return (
                                    <button
                                      key={permission.id}
                                      type="button"
                                      onClick={() => void togglePermission(role.id, permission.id)}
                                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                                        assigned
                                          ? 'border-olive bg-olive/10 text-text-dark'
                                          : 'border-olive-light/40 bg-white text-text-dark/70 hover:border-olive'
                                      }`}
                                    >
                                      <span>
                                        <span className="font-medium">{permission.key}</span>
                                        <span className="block text-xs text-text-dark/50">{permission.description ?? permission.key}</span>
                                      </span>
                                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${assigned ? 'bg-olive text-white' : 'bg-gray-100 text-gray-600'}`}>
                                        {assigned ? 'Enabled' : 'Disabled'}
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/40 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-text-dark">Create Role</h2>
                <p className="text-sm text-text-dark/70">Add a new role and define its baseline description.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
            </div>
            <form className="space-y-6 bg-beige/10 px-6 py-6" onSubmit={createRole}>
              <div className="space-y-2">
                <Label htmlFor="role-name">Role name</Label>
                <Input
                  id="role-name"
                  placeholder="Enter role name"
                  value={newRole.name}
                  onChange={(event) => setNewRole((previous) => ({ ...previous, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-description">Short description</Label>
                <Input
                  id="role-description"
                  placeholder="Describe the scope of this role"
                  value={newRole.description}
                  onChange={(event) => setNewRole((previous) => ({ ...previous, description: event.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-olive-light/40 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Role</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default RoleManagement
