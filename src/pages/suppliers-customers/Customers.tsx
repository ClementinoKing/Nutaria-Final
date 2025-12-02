import { useEffect, useMemo, useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ResponsiveTable from '@/components/ResponsiveTable'
import { Plus, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useCustomers, Customer } from '@/hooks/useCustomers'
import { useAuth } from '@/context/AuthContext'

const createUniqueId = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`

const createEmptyForm = () => ({
  name: '',
  billing_address: '',
  shipping_address: '',
  phone: '',
  email: '',
  contacts: [
    {
      clientId: createUniqueId('contact'),
      name: '',
      email: '',
      phone: '',
      role: ''
    }
  ]
})

const createFormErrors = () => ({
  fields: {} as Record<string, string | undefined>,
  contacts: {} as Record<string, string | undefined>
})

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(value: string | null | undefined): boolean {
  if (!value) return true
  return emailPattern.test(value.trim())
}

const populateFormFromCustomer = (customer: Customer | null | undefined) => {
  if (!customer) {
    return createEmptyForm()
  }

  const contacts =
    customer.contacts && customer.contacts.length > 0
      ? customer.contacts.map((contact) => ({
          clientId: String(contact.id ?? createUniqueId('contact')),
          id: contact.id ?? null,
          name: String(contact.name ?? ''),
          email: String(contact.email ?? ''),
          phone: String(contact.phone ?? ''),
          role: String(contact.role ?? '')
        }))
      : [
          {
            clientId: createUniqueId('contact'),
            name: '',
            email: '',
            phone: '',
            role: ''
          }
        ]

  return {
    name: String(customer.name ?? ''),
    billing_address: String(customer.billing_address ?? ''),
    shipping_address: String(customer.shipping_address ?? ''),
    phone: String(customer.phone ?? ''),
    email: String(customer.email ?? ''),
    contacts
  }
}

function Customers() {
  const { customers, setCustomers, loading, error, refresh } = useCustomers()
  const { user } = useAuth()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState(createEmptyForm())
  const [formErrors, setFormErrors] = useState(createFormErrors())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | number | null>(null)
  const [editingCustomerId, setEditingCustomerId] = useState<string | number | null>(null)

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? 'Unable to load customers from Supabase.')
    }
  }, [error])

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  )

  const summary = useMemo(() => {
    const totalContacts = customers.reduce((count, customer) => count + (customer.contacts?.length ?? 0), 0)
    return {
      totalCustomers: customers.length,
      totalContacts
    }
  }, [customers])

  const resetForm = () => {
    setFormData(createEmptyForm())
    setFormErrors(createFormErrors())
    setIsSubmitting(false)
    setEditingCustomerId(null)
  }

  const handleOpenModal = (customer: Customer | null = null) => {
    if (customer) {
      setFormData(populateFormFromCustomer(customer))
      setFormErrors(createFormErrors())
      setEditingCustomerId((customer.id as string | number | null) ?? null)
    } else {
      resetForm()
    }
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    resetForm()
  }

  const handleFieldChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }))
    setFormErrors((prev) => ({
      ...prev,
      fields: { ...prev.fields, [name]: undefined }
    }))
  }

  const handleContactChange = (clientId: string, key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact) =>
        contact.clientId === clientId ? { ...contact, [key]: value } : contact
      )
    }))
    setFormErrors((prev) => ({
      ...prev,
      contacts: { ...prev.contacts, [clientId]: undefined }
    }))
  }

  const handleAddContact = () => {
    setFormData((prev) => ({
      ...prev,
      contacts: [
        ...prev.contacts,
        {
          clientId: createUniqueId('contact'),
          name: '',
          email: '',
          phone: '',
          role: ''
        }
      ]
    }))
  }

  const handleRemoveContact = (clientId: string) => {
    setFormData((prev) => {
      const remaining = prev.contacts.filter((contact) => contact.clientId !== clientId)
      return {
        ...prev,
        contacts: remaining.length > 0 ? remaining : prev.contacts
      }
    })
  }

  const validateForm = (data: ReturnType<typeof createEmptyForm>) => {
    const errors = createFormErrors()

    if (!data.name || !data.name.trim()) {
      errors.fields.name = 'Customer name is required.'
    }

    if (data.email && !validateEmail(data.email)) {
      errors.fields.email = 'Enter a valid email address.'
    }

    data.contacts.forEach((contact) => {
      const hasAnyValue = (['name', 'email', 'phone', 'role'] as const).some((key) => {
        const value = contact[key]
        return typeof value === 'string' && value.trim().length > 0
      })
      if (!hasAnyValue) {
        return
      }

      if (!contact.name.trim()) {
        errors.contacts[contact.clientId] = 'Contact name is required.'
        return
      }

      if (contact.email && !validateEmail(contact.email)) {
        errors.contacts[contact.clientId] = 'Enter a valid email address.'
      }
    })

    const hasErrors =
      Object.values(errors.fields).some(Boolean) || Object.values(errors.contacts).some(Boolean)

    return hasErrors ? errors : null
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationErrors = validateForm(formData)
    if (validationErrors) {
      setFormErrors(validationErrors)
      return
    }

    if (!user) {
      toast.error('You need to be signed in to create customers.')
      return
    }

    setIsSubmitting(true)
    const payload = {
      name: formData.name.trim(),
      billing_address: formData.billing_address?.trim() || null,
      shipping_address: formData.shipping_address?.trim() || null,
      phone: formData.phone?.trim() || null,
      email: formData.email?.trim() || null
    }

    try {
      let customerRecord = null
      if (editingCustomerId) {
        const { data: updatedCustomer, error: updateError } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', editingCustomerId)
          .select()
          .single()

        if (updateError) {
          throw updateError
        }
        customerRecord = updatedCustomer

        const { error: deleteContactsError } = await supabase
          .from('customer_contacts')
          .delete()
          .eq('customer_id', editingCustomerId)

        if (deleteContactsError) {
          console.error('Failed to clear existing contacts', deleteContactsError)
        }
      } else {
        const { data: insertedCustomer, error: insertError } = await supabase
          .from('customers')
          .insert(payload)
          .select()
          .single()

        if (insertError) {
          throw insertError
        }
        customerRecord = insertedCustomer
      }

      let persistedContacts = []
      const contactsToInsert = formData.contacts
        .filter((contact) => contact.name && contact.name.trim())
        .map((contact) => ({
          customer_id: customerRecord.id,
          name: contact.name.trim(),
          email: contact.email?.trim() || null,
          phone: contact.phone?.trim() || null,
          role: contact.role?.trim() || null
        }))

      if (contactsToInsert.length > 0) {
        const { data: contactData, error: contactsError } = await supabase
          .from('customer_contacts')
          .insert(contactsToInsert)
          .select()

        if (contactsError) {
          throw contactsError
        }
        persistedContacts = contactData ?? []
      }

      const customerWithContacts = {
        ...customerRecord,
        contacts: persistedContacts
      }

      if (editingCustomerId) {
        setCustomers((prev = []) =>
          prev.map((customer) => (customer.id === editingCustomerId ? customerWithContacts : customer))
        )
        setSelectedCustomerId(editingCustomerId)
        toast.success('Customer updated')
      } else {
        setCustomers((prev = []) => [customerWithContacts, ...prev])
        setSelectedCustomerId(customerRecord.id)
        toast.success('Customer added')
      }

      resetForm()
      setIsModalOpen(false)
    } catch (submissionError) {
      console.error('Error saving customer', submissionError)
      const errorMessage = submissionError instanceof Error ? submissionError.message : 'Unable to save customer.'
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isEditing = Boolean(editingCustomerId)

  const columns = [
    {
      key: 'name',
      header: 'Customer',
      render: (customer: Customer) => (
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-text-dark">{String(customer.name ?? '')}</p>
          <p className="text-xs text-text-dark/60">{String(customer.email ?? '') || 'No email'}</p>
        </div>
      ),
      mobileRender: (customer: Customer) => (
        <div className="text-right">
          <p className="text-sm font-medium text-text-dark">{String(customer.name ?? '')}</p>
          <p className="text-xs text-text-dark/60">{String(customer.email ?? '') || 'No email'}</p>
        </div>
      )
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (customer: Customer) => String(customer.phone ?? '') || '—',
      mobileRender: (customer: Customer) => String(customer.phone ?? '') || '—',
      cellClassName: 'text-text-dark/70',
      mobileValueClassName: 'text-text-dark'
    },
    {
      key: 'contacts',
      header: 'Contacts',
      render: (customer: Customer) => (
        <span className="inline-flex items-center rounded-full bg-olive-light/30 px-2 py-1 text-xs font-medium text-text-dark/70">
          {customer.contacts?.length ?? 0}
        </span>
      ),
      mobileRender: (customer: Customer) => (
        <span className="inline-flex items-center rounded-full bg-olive-light/30 px-2 py-1 text-xs font-medium text-text-dark/70">
          {customer.contacts?.length ?? 0}
        </span>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right'
    }
  ]

  return (
    <PageLayout
      title="Customers"
      activeItem="suppliersCustomers"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            Refresh
          </Button>
          <Button size="sm" className="bg-olive hover:bg-olive-dark" onClick={() => handleOpenModal(null)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        </div>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-olive-light/30 bg-white">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-text-dark">Total Customers</CardTitle>
                <CardDescription>Active accounts managed in the CRM</CardDescription>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-olive-light/30 text-lg font-semibold text-olive-dark">
                {summary.totalCustomers}
              </span>
            </CardHeader>
          </Card>
          <Card className="border-olive-light/30 bg-white">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-text-dark">Total Contacts</CardTitle>
                <CardDescription>Key client stakeholders captured</CardDescription>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-olive-light/30 text-lg font-semibold text-olive-dark">
                {summary.totalContacts}
              </span>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="border-olive-light/30 bg-white lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-text-dark">Customer Directory</CardTitle>
              <CardDescription>Manage billing relationships and points of contact.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12 text-sm text-text-dark/60">
                  Loading customers from Supabase…
                </div>
              ) : customers.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <Users className="h-10 w-10 text-olive" />
                  <p className="text-sm font-medium text-text-dark">No customers captured yet.</p>
                  <p className="text-xs text-text-dark/60">Add your first customer to build the CRM directory.</p>
                  <Button size="sm" className="bg-olive hover:bg-olive-dark" onClick={() => handleOpenModal(null)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Customer
                  </Button>
                </div>
              ) : (
                <ResponsiveTable
                  columns={columns}
                  data={customers}
                  rowKey="id"
                  tableClassName=""
                  mobileCardClassName=""
                  getRowClassName={() => ''}
                  onRowClick={(customer: Customer) => setSelectedCustomerId((customer.id as string | number | null) ?? null)}
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-olive-light/30 bg-white">
            <CardHeader className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-text-dark">Customer Snapshot</CardTitle>
                  <CardDescription>
                    {selectedCustomer ? 'Active account details' : 'Select a customer to see details'}
                  </CardDescription>
                </div>
                {selectedCustomer ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenModal(selectedCustomer)}
                    className="shrink-0"
                  >
                    Edit
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-text-dark">
              {selectedCustomer ? (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-text-dark/60">Customer</p>
                    <p className="text-base font-medium text-text-dark">{String(selectedCustomer.name ?? '')}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-text-dark/60">Main contact</p>
                    <p className="text-sm text-text-dark/80">{String(selectedCustomer.email ?? '') || '—'}</p>
                    <p className="text-sm text-text-dark/80">{String(selectedCustomer.phone ?? '') || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-text-dark/60">Billing address</p>
                    <p className="text-sm text-text-dark/80">
                      {String(selectedCustomer.billing_address ?? '') || 'Not provided'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-text-dark/60">Shipping address</p>
                    <p className="text-sm text-text-dark/80">
                      {String(selectedCustomer.shipping_address ?? '') || 'Not provided'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-text-dark/60">Contacts</p>
                    {selectedCustomer.contacts?.length ? (
                      <ul className="space-y-2">
                        {selectedCustomer.contacts.map((contact) => (
                          <li
                            key={String(contact.id ?? contact.name ?? '')}
                            className="rounded-lg border border-olive-light/30 bg-olive-light/20 px-3 py-2"
                          >
                            <p className="text-sm font-medium text-text-dark">{String(contact.name ?? '')}</p>
                            <p className="text-xs text-text-dark/60">{String(contact.role ?? '') || 'No role recorded'}</p>
                            <p className="text-xs text-text-dark/60">{String(contact.email ?? '') || 'No email provided'}</p>
                            <p className="text-xs text-text-dark/60">{String(contact.phone ?? '') || 'No phone provided'}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-text-dark/70">No contacts recorded yet.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-text-dark/70">
                  Choose a customer from the directory to preview billing information and contact details.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-text-dark">{isEditing ? 'Edit Customer' : 'Add Customer'}</h2>
                <p className="text-sm text-text-dark/70">
                  {isEditing ? 'Update account details and key contacts.' : 'Capture account details and key contacts.'}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleCloseModal} className="text-text-dark">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <form
              id="customer-form"
              className="flex-1 overflow-y-auto bg-beige/10 px-6 py-6"
              onSubmit={handleSubmit}
            >
              <div className="space-y-6">
                <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-text-dark">Account details</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="name">Customer name*</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleFieldChange}
                        placeholder="Acme Retail"
                        disabled={isSubmitting}
                        className={formErrors.fields.name ? 'border-red-300 focus-visible:ring-red-500' : undefined}
                      />
                      {formErrors.fields.name && (
                        <p className="text-xs text-red-600">{formErrors.fields.name}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleFieldChange}
                        placeholder="account@acmeretail.co.za"
                        disabled={isSubmitting}
                        className={formErrors.fields.email ? 'border-red-300 focus-visible:ring-red-500' : undefined}
                      />
                      {formErrors.fields.email && (
                        <p className="text-xs text-red-600">{formErrors.fields.email}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleFieldChange}
                        placeholder="+27 21 555 0198"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="billing_address">Billing address</Label>
                      <textarea
                        id="billing_address"
                        name="billing_address"
                        value={formData.billing_address}
                        onChange={handleFieldChange}
                        rows={3}
                        placeholder="Street, City, Postal Code"
                        disabled={isSubmitting}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="shipping_address">Shipping address</Label>
                      <textarea
                        id="shipping_address"
                        name="shipping_address"
                        value={formData.shipping_address}
                        onChange={handleFieldChange}
                        rows={3}
                        placeholder="Street, City, Postal Code"
                        disabled={isSubmitting}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-text-dark">Contacts</h3>
                  <p className="text-sm text-text-dark/70">
                    Capture account managers, buyers, or finance contacts for this customer.
                  </p>
                  <div className="mt-4 space-y-4">
                    {formData.contacts.map((contact) => {
                      const contactError = formErrors.contacts[contact.clientId]
                      return (
                        <div
                          key={contact.clientId}
                          className={`rounded-lg border p-4 ${
                            contactError ? 'border-red-300 bg-red-50/40' : 'border-olive-light/40 bg-olive-light/10'
                          }`}
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`contact-name-${contact.clientId}`}>Name</Label>
                              <Input
                                id={`contact-name-${contact.clientId}`}
                                value={contact.name}
                                onChange={(event) =>
                                  handleContactChange(contact.clientId, 'name', event.target.value)
                                }
                                placeholder="Nomsa Khumalo"
                                disabled={isSubmitting}
                                className={contactError ? 'border-red-300 focus-visible:ring-red-500' : undefined}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`contact-role-${contact.clientId}`}>Role / Department</Label>
                              <Input
                                id={`contact-role-${contact.clientId}`}
                                value={contact.role}
                                onChange={(event) =>
                                  handleContactChange(contact.clientId, 'role', event.target.value)
                                }
                                placeholder="Procurement"
                                disabled={isSubmitting}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`contact-email-${contact.clientId}`}>Email</Label>
                              <Input
                                id={`contact-email-${contact.clientId}`}
                                type="email"
                                value={contact.email}
                                onChange={(event) =>
                                  handleContactChange(contact.clientId, 'email', event.target.value)
                                }
                                placeholder="nomsa.khumalo@acmeretail.co.za"
                                disabled={isSubmitting}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`contact-phone-${contact.clientId}`}>Phone</Label>
                              <Input
                                id={`contact-phone-${contact.clientId}`}
                                value={contact.phone}
                                onChange={(event) =>
                                  handleContactChange(contact.clientId, 'phone', event.target.value)
                                }
                                placeholder="+27 82 123 4567"
                                disabled={isSubmitting}
                              />
                            </div>
                          </div>
                          {contactError && <p className="text-xs text-red-600">{contactError}</p>}
                          {formData.contacts.length > 1 && (
                            <div className="flex justify-end pt-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleRemoveContact(contact.clientId)}
                                disabled={isSubmitting}
                              >
                                Remove contact
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <Button type="button" variant="outline" size="sm" onClick={handleAddContact} disabled={isSubmitting}>
                      Add another contact
                    </Button>
                  </div>
                </section>
              </div>
            </form>
            <div className="flex justify-end gap-3 border-t border-olive-light/30 bg-white px-6 py-4">
              <Button variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" form="customer-form" className="bg-olive hover:bg-olive-dark" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save Customer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default Customers

