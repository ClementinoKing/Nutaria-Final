export type CustomerAddressType = 'BILLING' | 'SHIPPING'

export type CustomerAddressFormEntry = {
  clientId: string
  label: string
  address: string
}

export type CustomerAddressRecord = {
  id?: string | number | null
  address_type?: CustomerAddressType | string | null
  label?: string | null
  address?: string | null
  is_primary?: boolean | null
}

export const createCustomerAddressEntry = (
  overrides: Partial<CustomerAddressFormEntry> = {}
): CustomerAddressFormEntry => ({
  clientId:
    overrides.clientId ??
    `address-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`,
  label: overrides.label ?? '',
  address: overrides.address ?? '',
})

export const getPrimaryCustomerAddress = (
  addresses: CustomerAddressRecord[],
  type: CustomerAddressType,
  fallback?: string | null
) => {
  const matching = addresses
    .filter((entry) => entry.address_type === type)
    .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))

  return matching[0]?.address?.trim() || fallback || ''
}

export const getAdditionalCustomerAddresses = (
  addresses: CustomerAddressRecord[],
  type: CustomerAddressType
): CustomerAddressFormEntry[] =>
  addresses
    .filter((entry) => entry.address_type === type)
    .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))
    .slice(1)
    .map((entry, index) =>
      createCustomerAddressEntry({
        clientId: String(entry.id ?? `${type.toLowerCase()}-${index}`),
        label: entry.label ?? '',
        address: entry.address ?? '',
      })
    )

export const normalizeCustomerAddresses = (
  type: CustomerAddressType,
  primaryAddress: string,
  additionalAddresses: CustomerAddressFormEntry[]
) =>
  [
    { label: '', address: primaryAddress, is_primary: true },
    ...additionalAddresses.map((entry) => ({
      label: entry.label,
      address: entry.address,
      is_primary: false,
    })),
  ]
    .filter((entry) => entry.address.trim())
    .map((entry, index) => ({
      address_type: type,
      label: entry.label.trim() || null,
      address: entry.address.trim(),
      is_primary: index === 0,
    }))
