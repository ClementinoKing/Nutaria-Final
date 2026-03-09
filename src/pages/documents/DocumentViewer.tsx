import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageLayout from '@/components/layout/PageLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { getStoredFileUrl } from '@/lib/fileStorage'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

const getFileExtension = (name: string): string => {
  const parts = name.toLowerCase().split('.')
  return parts.length > 1 ? parts.pop() || '' : ''
}

const isImageFile = (name: string) => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(getFileExtension(name))
const isPdfFile = (name: string) => getFileExtension(name) === 'pdf'

function DocumentViewer() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const storagePath = searchParams.get('path')?.trim() || ''
  const fileName = searchParams.get('name')?.trim() || 'Document'
  const source = searchParams.get('source')?.trim() || 'documents'

  const [signedUrl, setSignedUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const fileKind = useMemo(() => {
    if (isPdfFile(fileName)) return 'pdf'
    if (isImageFile(fileName)) return 'image'
    return 'other'
  }, [fileName])

  useEffect(() => {
    const load = async () => {
      if (!storagePath) {
        setLoading(false)
        return
      }

      try {
        const url = await getStoredFileUrl(storagePath, 3600)
        setSignedUrl(url)
      } catch (error) {
        console.error('Failed to load document URL', error)
        toast.error('Failed to load document.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [storagePath])

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    if (source === 'supplier') {
      navigate('/suppliers-customers/suppliers')
      return
    }
    navigate('/dashboard')
  }

  return (
    <PageLayout
      title="Document Viewer"
      activeItem="suppliersCustomers"
      leadingActions={
        <Button size="icon" variant="outline" onClick={handleBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      }
      actions={
        signedUrl ? (
          <Button asChild className="bg-olive hover:bg-olive-dark">
            <a href={signedUrl} target="_blank" rel="noopener noreferrer">
              Open Original
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        ) : null
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <Card className="border-olive-light/40 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">{fileName}</CardTitle>
          <CardDescription>Full document view</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Spinner text="Loading document..." />
          ) : !storagePath || !signedUrl ? (
            <div className="rounded-lg border border-olive-light/40 bg-olive-light/10 p-6 text-sm text-text-dark/70">
              Unable to load this document.
            </div>
          ) : fileKind === 'image' ? (
            <div className="overflow-hidden rounded-lg border border-olive-light/40 bg-olive-light/10 p-3">
              <img src={signedUrl} alt={fileName} className="mx-auto max-h-[75vh] w-auto rounded-md object-contain" />
            </div>
          ) : fileKind === 'pdf' ? (
            <div className="overflow-hidden rounded-lg border border-olive-light/40 bg-olive-light/10">
              <iframe src={signedUrl} title={fileName} className="h-[75vh] w-full" />
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4 rounded-lg border border-olive-light/40 bg-olive-light/10 p-6">
              <p className="text-sm text-text-dark/70">
                Preview is not available for this file type. Open the original document in a new tab.
              </p>
              <Button asChild variant="outline">
                <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                  Open File
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default DocumentViewer
