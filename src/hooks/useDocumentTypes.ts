import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export interface DocumentType {
  code: string
  name: string
  description: string | null
  has_expiry_date: boolean
  created_at: string | null
}

interface UseDocumentTypesReturn {
  documentTypes: DocumentType[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<{ error?: PostgrestError; data?: DocumentType[] }>
}

export function useDocumentTypes(): UseDocumentTypesReturn {
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchDocumentTypes = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('document_types')
      .select('code, name, description, has_expiry_date, created_at')
      .order('code')

    if (fetchError) {
      setError(fetchError)
      setLoading(false)
      return { error: fetchError }
    }

    const list = (data ?? []) as DocumentType[]
    setDocumentTypes(list)
    setLoading(false)
    return { data: list }
  }, [])

  useEffect(() => {
    fetchDocumentTypes()
  }, [fetchDocumentTypes])

  return {
    documentTypes,
    loading,
    error,
    refresh: fetchDocumentTypes
  }
}
