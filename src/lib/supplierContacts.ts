export type SupplierContactFormEntry = {
  clientId: string
  name: string
  email: string
  phone: string
  role: string
}

export type SupplierContactRecord = {
  id?: string | number | null
  name?: string | null
  email?: string | null
  phone?: string | null
  role?: string | null
  is_primary?: boolean | null
}

export const createSupplierContactEntry = (
  overrides: Partial<SupplierContactFormEntry> = {}
): SupplierContactFormEntry => ({
  clientId:
    overrides.clientId ??
    `contact-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`,
  name: overrides.name ?? '',
  email: overrides.email ?? '',
  phone: overrides.phone ?? '',
  role: overrides.role ?? '',
})

export const contactHasData = (contact: {
  name?: string | null
  email?: string | null
  phone?: string | null
  role?: string | null
}): boolean =>
  Boolean(
    contact.name?.trim() ||
      contact.email?.trim() ||
      contact.phone?.trim() ||
      contact.role?.trim()
  )

export const normalizeSupplierContacts = (
  contacts: Array<{
    name?: string | null
    email?: string | null
    phone?: string | null
    role?: string | null
  }>
) =>
  contacts
    .filter(contactHasData)
    .map((contact, index) => ({
      name: contact.name?.trim() || null,
      email: contact.email?.trim() || null,
      phone: contact.phone?.trim() || null,
      role: contact.role?.trim() || null,
      is_primary: index === 0,
    }))

export const getPrimarySupplierContact = (
  contacts: SupplierContactRecord[],
  fallback?: {
    primary_contact_name?: unknown
    primary_contact_email?: unknown
    primary_contact_phone?: unknown
  } | null
) => {
  const sortedContacts = [...contacts].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))
  const primary = sortedContacts[0]

  if (primary) {
    return {
      name: primary.name ?? '',
      email: primary.email ?? '',
      phone: primary.phone ?? '',
      role: primary.role ?? '',
    }
  }

  return {
    name: String(fallback?.primary_contact_name ?? ''),
    email: String(fallback?.primary_contact_email ?? ''),
    phone: String(fallback?.primary_contact_phone ?? ''),
    role: '',
  }
}

export const getAdditionalSupplierContacts = (
  contacts: SupplierContactRecord[]
): SupplierContactFormEntry[] =>
  [...contacts]
    .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))
    .slice(1)
    .map((contact, index) =>
      createSupplierContactEntry({
        clientId: String(contact.id ?? `existing-${index}`),
        name: contact.name ?? '',
        email: contact.email ?? '',
        phone: contact.phone ?? '',
        role: contact.role ?? '',
      })
    )
