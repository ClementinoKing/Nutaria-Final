import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PostgrestError } from '@supabase/supabase-js'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Mail, MapPin, Phone, User2, Wallet } from 'lucide-react'

type CustomerContact = {
  id?: string | number | null
  name?: string | null
  email?: string | null
  phone?: string | null
  role?: string | null
}

type CustomerAddress = {
  id?: string | number | null
  address_type?: string | null
  label?: string | null
  address?: string | null
  is_primary?: boolean | null
}

type CustomerRecord = {
  id?: string | number | null
  name?: string | null
  email?: string | null
  phone?: string | null
  country?: string | null
  billing_address?: string | null
  shipping_address?: string | null
  created_at?: string | null
  customer_contacts?: CustomerContact[]
  customer_addresses?: CustomerAddress[]
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not available'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function CustomerDetail() {
  const navigate = useNavigate()
  const { customerId } = useParams()
  const [customer, setCustomer] = useState<CustomerRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  useEffect(() => {
    const fetchCustomer = async () => {
      const parsedId = customerId ? Number(customerId) : null
      if (!parsedId || Number.isNaN(parsedId)) {
        setLoading(false)
        return
      }

      const { data, error: fetchError } = await supabase
        .from('customers')
        .select('*, customer_contacts(*), customer_addresses(*)')
        .eq('id', parsedId)
        .maybeSingle()

      if (fetchError) {
        setError(fetchError)
        setLoading(false)
        return
      }

      setCustomer((data as CustomerRecord | null) ?? null)
      setLoading(false)
    }

    void fetchCustomer()
  }, [customerId])

  useEffect(() => {
    if (error) {
      setCustomer(null)
    }
  }, [error])

  const billingAddresses = useMemo(() => {
    const addresses = customer?.customer_addresses ?? []
    const matching = addresses.filter((entry) => entry.address_type === 'BILLING')
    if (matching.length > 0) {
      return [...matching].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))
    }
    return customer?.billing_address ? [{ address: customer.billing_address, is_primary: true }] : []
  }, [customer])

  const shippingAddresses = useMemo(() => {
    const addresses = customer?.customer_addresses ?? []
    const matching = addresses.filter((entry) => entry.address_type === 'SHIPPING')
    if (matching.length > 0) {
      return [...matching].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))
    }
    return customer?.shipping_address ? [{ address: customer.shipping_address, is_primary: true }] : []
  }, [customer])

  if (loading) {
    return (
      <PageLayout title="Customer Detail" activeItem="suppliersCustomers" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading customer details..." />
      </PageLayout>
    )
  }

  if (!customer) {
    return (
      <PageLayout
        title="Customer Detail"
        activeItem="suppliersCustomers"
        leadingActions={
          <Button size="icon" variant="outline" onClick={() => navigate('/suppliers-customers/customers')} aria-label="Back to Customers">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Card className="border-olive-light/30 bg-white">
          <CardHeader>
            <CardTitle>Customer not found</CardTitle>
            <CardDescription>The record could not be loaded.</CardDescription>
          </CardHeader>
        </Card>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Customer Detail"
      activeItem="suppliersCustomers"
      leadingActions={
        <Button size="icon" variant="outline" onClick={() => navigate('/suppliers-customers/customers')} aria-label="Back to Customers">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      }
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={() => navigate('/suppliers-customers/customers', { state: { editCustomerId: customer.id } })}>
          Edit Customer
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="space-y-6">
        <Card className="border-olive-light/35 bg-white shadow-sm">
          <CardContent className="px-6 py-6 lg:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-dark/45">Customer profile</p>
                  <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text-dark">{customer.name || 'Unnamed customer'}</h1>
                </div>
                <div className="grid gap-2 text-sm text-text-dark/75 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-text-dark/45" />
                    <span>{customer.email || 'No email'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-text-dark/45" />
                    <span>{customer.phone || 'No phone'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-text-dark/45" />
                    <span>{customer.country || 'No country'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-text-dark/45" />
                    <span>Added {formatDate(customer.created_at)}</span>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-olive-light/25 bg-olive-light/10 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-dark/50">Contacts</p>
                  <p className="mt-2 text-2xl font-semibold text-text-dark">{customer.customer_contacts?.length ?? 0}</p>
                </div>
                <div className="rounded-xl border border-olive-light/25 bg-olive-light/10 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-dark/50">Billing</p>
                  <p className="mt-2 text-2xl font-semibold text-text-dark">{billingAddresses.length}</p>
                </div>
                <div className="rounded-xl border border-olive-light/25 bg-olive-light/10 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-dark/50">Shipping</p>
                  <p className="mt-2 text-2xl font-semibold text-text-dark">{shippingAddresses.length}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="border-olive-light/35 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Contacts</CardTitle>
              <CardDescription>Account managers, finance contacts, and buyer relationships.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer.customer_contacts?.length ? (
                customer.customer_contacts.map((contact, index) => (
                  <div key={String(contact.id ?? index)} className="rounded-xl border border-olive-light/20 bg-olive-light/10 p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-olive-dark">
                        <User2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-dark">{contact.name || 'Unnamed contact'}</p>
                        <p className="mt-1 text-xs text-text-dark/60">{contact.role || 'No role recorded'}</p>
                        <p className="mt-2 text-sm text-text-dark/75">{contact.email || 'No email provided'}</p>
                        <p className="text-sm text-text-dark/75">{contact.phone || 'No phone provided'}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-olive-light/40 bg-olive-light/10 px-4 py-5 text-sm text-text-dark/60">
                  No customer contacts recorded.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-olive-light/35 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Billing Addresses</CardTitle>
              <CardDescription>Invoice and accounts payable destinations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {billingAddresses.length ? (
                billingAddresses.map((address, index) => (
                  <div key={String(address.id ?? index)} className="rounded-xl border border-olive-light/20 bg-olive-light/10 p-4">
                    <div className="flex items-center gap-2">
                      {address.label && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-dark/55">{address.label}</p>}
                      {address.is_primary && (
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-olive-dark">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-text-dark/80">{address.address || 'No address recorded'}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-olive-light/40 bg-olive-light/10 px-4 py-5 text-sm text-text-dark/60">
                  No billing addresses recorded.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-olive-light/35 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Shipping Addresses</CardTitle>
              <CardDescription>Delivery and receiving destinations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {shippingAddresses.length ? (
                shippingAddresses.map((address, index) => (
                  <div key={String(address.id ?? index)} className="rounded-xl border border-olive-light/20 bg-olive-light/10 p-4">
                    <div className="flex items-center gap-2">
                      {address.label && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-dark/55">{address.label}</p>}
                      {address.is_primary && (
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-olive-dark">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-text-dark/80">{address.address || 'No address recorded'}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-olive-light/40 bg-olive-light/10 px-4 py-5 text-sm text-text-dark/60">
                  No shipping addresses recorded.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  )
}

export default CustomerDetail
