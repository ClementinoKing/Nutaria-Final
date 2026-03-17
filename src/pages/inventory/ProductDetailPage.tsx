import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ResponsiveTable from '@/components/ResponsiveTable'
import { Spinner } from '@/components/ui/spinner'
import { supabase } from '@/lib/supabaseClient'

interface ProductSummary {
  id: number
  name: string | null
  sku: string | null
  status: string | null
  product_type: string | null
  notes: string | null
}

interface ProductComponentRow {
  parent: ProductSummary | null
}

interface RelatedRow {
  id: number
  name: string | null
  sku: string | null
  status: string | null
  product_type: string | null
}

interface ChainMembershipRow {
  chain_id: number
  stage: 'RAW' | 'WIP' | 'FINISHED'
  display_order: number
  chain: { name: string | null } | null
  product: RelatedRow | null
}

function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [product, setProduct] = useState<ProductSummary | null>(null)
  const [rawProducts, setRawProducts] = useState<RelatedRow[]>([])
  const [wipProducts, setWipProducts] = useState<RelatedRow[]>([])
  const [finishedProducts, setFinishedProducts] = useState<RelatedRow[]>([])
  const [chainName, setChainName] = useState<string | null>(null)

  const load = useCallback(async () => {
    const pid = productId ? Number(productId) : NaN
    if (!Number.isFinite(pid)) {
      setError('Invalid product id.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('id, name, sku, status, product_type, notes')
        .eq('id', pid)
        .single()

      if (productError || !productData) {
        throw new Error(productError?.message ?? 'Product not found.')
      }
      setProduct(productData as ProductSummary)

      const { data: chainMembershipRows, error: chainMembershipError } = await supabase
        .from('product_processing_chain_members')
        .select('chain_id, stage, display_order, chain:product_processing_chains(name), product:products(id, name, sku, status, product_type)')
        .eq('product_id', pid)
        .limit(1)

      if (chainMembershipError) throw chainMembershipError

      const membership = ((chainMembershipRows ?? []) as ChainMembershipRow[])[0]
      if (membership?.chain_id) {
        const { data: allChainMembers, error: allMembersError } = await supabase
          .from('product_processing_chain_members')
          .select('chain_id, stage, display_order, chain:product_processing_chains(name), product:products(id, name, sku, status, product_type)')
          .eq('chain_id', membership.chain_id)
          .order('display_order', { ascending: true })

        if (allMembersError) throw allMembersError

        const chainRows = (allChainMembers ?? []) as ChainMembershipRow[]
        const chainLabel =
          chainRows[0]?.chain?.name && chainRows[0].chain.name.trim().length > 0
            ? chainRows[0].chain.name.trim()
            : `Chain ${membership.chain_id}`

        setChainName(chainLabel)
        setRawProducts(
          chainRows
            .filter((row) => row.stage === 'RAW' && row.product?.id)
            .map((row) => row.product as RelatedRow)
        )
        setWipProducts(
          chainRows
            .filter((row) => row.stage === 'WIP' && row.product?.id)
            .map((row) => row.product as RelatedRow)
        )
        setFinishedProducts(
          chainRows
            .filter((row) => row.stage === 'FINISHED' && row.product?.id)
            .map((row) => row.product as RelatedRow)
        )
        setLoading(false)
        return
      }

      setChainName(null)
      setRawProducts([productData as RelatedRow])

      const { data: wipLinks, error: wipError } = await supabase
        .from('product_components')
        .select('parent:products!product_components_parent_product_id_fkey(id, name, sku, status, product_type)')
        .eq('component_product_id', pid)

      if (wipError) throw wipError

      const wipMap = new Map<number, RelatedRow>()
      ;((wipLinks ?? []) as ProductComponentRow[]).forEach((row) => {
        const parent = row.parent
        if (!parent?.id) return
        if ((parent.product_type ?? '').toUpperCase() !== 'WIP') return
        wipMap.set(parent.id, parent)
      })
      const wips = Array.from(wipMap.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      setWipProducts(wips)

      const finishedMap = new Map<number, RelatedRow>()

      if (wips.length > 0) {
        const { data: finishedFromWip, error: finishedFromWipError } = await supabase
          .from('product_components')
          .select('parent:products!product_components_parent_product_id_fkey(id, name, sku, status, product_type)')
          .in('component_product_id', wips.map((w) => w.id))

        if (finishedFromWipError) throw finishedFromWipError

        ;((finishedFromWip ?? []) as ProductComponentRow[]).forEach((row) => {
          const parent = row.parent
          if (!parent?.id) return
          if ((parent.product_type ?? '').toUpperCase() !== 'FINISHED') return
          finishedMap.set(parent.id, parent)
        })
      }

      const { data: directFinished, error: directFinishedError } = await supabase
        .from('product_components')
        .select('parent:products!product_components_parent_product_id_fkey(id, name, sku, status, product_type)')
        .eq('component_product_id', pid)

      if (directFinishedError) throw directFinishedError

      ;((directFinished ?? []) as ProductComponentRow[]).forEach((row) => {
        const parent = row.parent
        if (!parent?.id) return
        if ((parent.product_type ?? '').toUpperCase() !== 'FINISHED') return
        finishedMap.set(parent.id, parent)
      })

      const finished = Array.from(finishedMap.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      setFinishedProducts(finished)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load product detail.')
      setProduct(null)
      setRawProducts([])
      setWipProducts([])
      setFinishedProducts([])
      setChainName(null)
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    load()
  }, [load])

  const relatedColumns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Product',
        render: (row: RelatedRow) => (
          <div className="font-medium text-text-dark">{row.name ?? 'Unnamed product'}</div>
        ),
        mobileRender: (row: RelatedRow) => (
          <div className="font-medium text-text-dark">{row.name ?? 'Unnamed product'}</div>
        ),
      },
      {
        key: 'sku',
        header: 'SKU',
        render: (row: RelatedRow) => row.sku ?? '—',
        mobileRender: (row: RelatedRow) => row.sku ?? '—',
      },
      {
        key: 'status',
        header: 'Status',
        render: (row: RelatedRow) => row.status ?? '—',
        mobileRender: (row: RelatedRow) => row.status ?? '—',
      },
      {
        key: 'type',
        header: 'Type',
        render: (row: RelatedRow) => (row.product_type ?? '—').toUpperCase(),
        mobileRender: (row: RelatedRow) => (row.product_type ?? '—').toUpperCase(),
      },
    ],
    []
  )

  const detailDisplayName = chainName || product?.name || 'Product'
  const detailSkuText = chainName
    ? (rawProducts.map((row) => row.sku).filter((sku): sku is string => Boolean(sku && sku.trim())).join(', ') || '—')
    : (product?.sku ?? '—')

  if (loading) {
    return (
      <PageLayout
        title="Product Detail"
        activeItem="inventory"
        leadingActions={
          <Button size="icon" variant="outline" onClick={() => navigate('/inventory/products')} aria-label="Back to Products">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading product detail..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Product Detail"
      activeItem="inventory"
      leadingActions={
        <Button size="icon" variant="outline" onClick={() => navigate('/inventory/products')} aria-label="Back to Products">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8 space-y-6"
    >
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <Card className="border-olive-light/30">
        <CardHeader>
          <CardDescription>{chainName ? 'Chain detail' : 'Raw product detail'}</CardDescription>
          <CardTitle className="text-text-dark">{detailDisplayName}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 text-sm text-text-dark/80">
          <div><span className="font-medium text-text-dark">SKU:</span> {detailSkuText}</div>
          <div><span className="font-medium text-text-dark">Type:</span> {(product?.product_type ?? '—').toUpperCase()}</div>
          <div><span className="font-medium text-text-dark">Status:</span> {product?.status ?? '—'}</div>
          <div className="sm:col-span-3"><span className="font-medium text-text-dark">Notes:</span> {product?.notes ?? '—'}</div>
        </CardContent>
      </Card>

      <Card className="border-olive-light/30 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">Chain Graph</CardTitle>
          <CardDescription>
            {chainName ? `Quick lineage for ${chainName}.` : 'Quick lineage from raw input to processed outputs.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-center md:gap-5">
            <div className="w-full rounded-lg border border-amber-300 bg-amber-50 p-3 md:w-[330px]">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">RAW</div>
              {rawProducts.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {rawProducts.map((row) => (
                    <li key={row.id} className="text-sm text-text-dark">
                      <span className="font-medium">{row.name ?? 'Unnamed raw product'}</span>
                      <span className="ml-2 text-xs text-text-dark/60">{row.sku ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-text-dark/60">No raw links</p>
              )}
            </div>

            <div className="hidden text-center text-lg text-olive md:block">→</div>

            <div className="w-full rounded-lg border border-blue-300 bg-blue-50 p-3 md:w-[420px]">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-900">WIP</div>
              {wipProducts.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {wipProducts.map((row) => (
                    <li key={row.id} className="text-sm text-text-dark">
                      <span className="font-medium">{row.name ?? 'Unnamed WIP'}</span>
                      <span className="ml-2 text-xs text-text-dark/60">{row.sku ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-text-dark/60">No WIP links</p>
              )}
            </div>

            <div className="hidden text-center text-lg text-olive md:block">→</div>

            <div className="w-full rounded-lg border border-green-300 bg-green-50 p-3 md:w-[330px]">
              <div className="text-xs font-semibold uppercase tracking-wide text-green-900">FINISHED</div>
              {finishedProducts.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {finishedProducts.map((row) => (
                    <li key={row.id} className="text-sm text-text-dark">
                      <span className="font-medium">{row.name ?? 'Unnamed finished'}</span>
                      <span className="ml-2 text-xs text-text-dark/60">{row.sku ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-text-dark/60">No finished links</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-olive-light/30 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">{chainName ? 'WIP Products In This Chain' : 'WIP Products From This Raw Product'}</CardTitle>
          <CardDescription>{chainName ? 'All WIP products in the selected chain.' : 'Products that use this raw product as an input.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={relatedColumns}
            data={wipProducts}
            rowKey="id"
            emptyMessage="No WIP products linked to this raw product."
            tableClassName=""
            mobileCardClassName=""
            getRowClassName={() => ''}
          />
        </CardContent>
      </Card>

      <Card className="border-olive-light/30 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">{chainName ? 'Finished Products In This Chain' : 'Finished Products From This Raw Product'}</CardTitle>
          <CardDescription>{chainName ? 'All finished products in the selected chain.' : 'Finished products linked through WIP mapping (plus direct legacy links).'}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={relatedColumns}
            data={finishedProducts}
            rowKey="id"
            emptyMessage="No finished products linked to this raw product."
            tableClassName=""
            mobileCardClassName=""
            getRowClassName={() => ''}
          />
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default ProductDetailPage
