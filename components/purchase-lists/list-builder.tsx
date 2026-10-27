'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Images,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, Input, Select, Textarea } from '@/components/ui/field'
import { ErrorNote } from '@/components/common/states'
import { Modal } from '@/components/ui/modal'
import { VendorForm } from '@/components/vendors/vendor-form'
import { ListShareActions } from '@/components/purchase-lists/list-share-actions'
import { deletePurchaseList, savePurchaseList, type PurchaseListItemInput } from '@/app/(app)/actions'
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS, UNITS, type ProductCategory } from '@/lib/constants'
import { formatDate, todayIST } from '@/lib/dates'
import { PHOTO_ACCEPT } from '@/lib/images'
import { formatMoney } from '@/lib/money'
import { removePhoto, uploadPhoto } from '@/lib/photo-upload'
import { cn } from '@/lib/utils'
import type { ListPdfInput } from '@/lib/list-pdf'
import type { PurchaseListWithContext, Vendor } from '@/lib/types'

/**
 * The screen you use standing in the vendor's shop.
 *
 * Photo first, details after: every photo taken or picked becomes a line on
 * the list straight away, and the name, quantity and price can be filled in
 * while the next piece is being photographed — or later, back at the shop.
 *
 * The list saves itself a moment after every change (and the photos upload
 * the instant they are taken), so a dropped signal or a closed browser
 * loses at most a few seconds of typing.
 */

interface PieceRow {
  key: string
  /** Database id once saved. */
  id: string | null
  product_name: string
  design_code: string
  colour: string
  category: string
  quantity: number
  unit: string
  notes: string
  photoPath: string | null
  preview: string | null
  uploading: boolean
  uploadError: string | null
  /** The price box as typed. Blank for staff even when a price exists. */
  rate: string
  /** Whether the price box was touched this session (staff never send it otherwise). */
  rateTouched: boolean
  /** A price exists in the database — shown to staff as a tick, not a number. */
  hasRate: boolean
  expanded: boolean
}

function newKey() {
  return Math.random().toString(36).slice(2)
}

function blankPiece(): PieceRow {
  return {
    key: newKey(),
    id: null,
    product_name: '',
    design_code: '',
    colour: '',
    category: 'other',
    quantity: 1,
    unit: 'pcs',
    notes: '',
    photoPath: null,
    preview: null,
    uploading: false,
    uploadError: null,
    rate: '',
    rateTouched: false,
    hasRate: false,
    expanded: false,
  }
}

const AUTOSAVE_DELAY_MS = 1500

export function ListBuilder({
  list,
  photoUrls,
  rates,
  vendors,
  categories,
  isAdmin,
  defaultVendorId,
  from,
}: {
  list: PurchaseListWithContext | null
  photoUrls: Record<string, string>
  /** Admin only: item id -> price. Empty for staff. */
  rates: Record<string, number | null>
  vendors: Vendor[]
  categories: { slug: string; label: string }[]
  isAdmin: boolean
  defaultVendorId?: string
  /** Who the list PDF is from — Settings → Purchase order details. */
  from: ListPdfInput['from']
}) {
  const router = useRouter()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [listId, setListId] = useState<string | null>(list?.id ?? null)
  const [vendorId, setVendorId] = useState(list?.vendor_id ?? defaultVendorId ?? '')
  const [vendorList, setVendorList] = useState(vendors)
  const [newVendorOpen, setNewVendorOpen] = useState(false)
  const [visitDate, setVisitDate] = useState(list?.visit_date ?? todayIST())
  const [notes, setNotes] = useState(list?.notes ?? '')
  const [pieces, setPieces] = useState<PieceRow[]>(() =>
    (list?.purchase_list_items ?? []).map((i) => ({
      key: i.id,
      id: i.id,
      product_name: i.product_name ?? '',
      design_code: i.design_code ?? '',
      colour: i.colour ?? '',
      category: i.category,
      quantity: i.quantity,
      unit: i.unit,
      notes: i.notes ?? '',
      photoPath: i.photo_path,
      preview: i.photo_path ? (photoUrls[i.photo_path] ?? null) : null,
      uploading: false,
      uploadError: null,
      rate: isAdmin && rates[i.id] != null ? String(rates[i.id]) : '',
      rateTouched: false,
      hasRate: i.has_rate,
      expanded: false,
    })),
  )

  // Save state. `dirty` flips on every edit; the effect below saves it.
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(list ? new Date(list.updated_at) : null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pending, start] = useTransition()

  const uploadsInFlight = pieces.some((p) => p.uploading)
  const piecesWithPhoto = pieces.filter((p) => p.photoPath).length
  const totalPcs = pieces.reduce((s, p) => s + (Number(p.quantity) || 0), 0)
  const knownTotal = useMemo(
    () =>
      isAdmin
        ? pieces.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.rate) || 0), 0)
        : 0,
    [pieces, isAdmin],
  )
  const pricedCount = pieces.filter((p) => (isAdmin ? p.rate !== '' : p.hasRate || (p.rateTouched && p.rate !== ''))).length

  function touch() {
    editSeq.current += 1
    setDirty(true)
    setSaveError(null)
  }

  function updatePiece(key: string, patch: Partial<PieceRow>) {
    setPieces((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  /** Build the payload the server action expects from the current rows. */
  const buildInput = useCallback(
    (rows: PieceRow[]) => ({
      id: listId,
      vendor_id: vendorId,
      visit_date: visitDate,
      notes,
      items: rows.map((p): PurchaseListItemInput => {
        const item: PurchaseListItemInput = {
          id: p.id,
          key: p.key,
          product_name: p.product_name,
          design_code: p.design_code,
          colour: p.colour,
          category: p.category,
          quantity: Number(p.quantity) || 1,
          unit: p.unit,
          notes: p.notes,
          photo_path: p.photoPath,
        }
        // Admin: the box shows the stored price, so always send what it shows.
        // Staff: only when they typed something, so a blank box never wipes
        // a price the owner can see and they cannot.
        if (isAdmin || p.rateTouched) {
          item.rate = p.rate.trim() === '' ? null : Number(p.rate)
        }
        return item
      }),
    }),
    [listId, vendorId, visitDate, notes, isAdmin],
  )

  const piecesRef = useRef(pieces)
  piecesRef.current = pieces
  // Counts edits, so a change typed while a save is in flight stays "unsaved".
  const editSeq = useRef(0)

  /** Save now. Returns the list id on success. */
  const save = useCallback(async (): Promise<string | null> => {
    if (!vendorId) {
      setSaveError('Choose the vendor whose shop you are at — the list saves itself after that.')
      return null
    }
    setSaving(true)
    setSaveError(null)
    const seq = editSeq.current
    const rows = piecesRef.current
    const res = await savePurchaseList(buildInput(rows))
    setSaving(false)
    if (!res.ok) {
      setSaveError(res.error)
      return null
    }
    // Learn the row ids so the next save edits rather than re-creates.
    const idByKey = new Map(res.items.map((i) => [i.key, i.id]))
    setPieces((current) =>
      current.map((p) => {
        const id = idByKey.get(p.key)
        if (!id) return p
        const priced = isAdmin || p.rateTouched ? p.rate.trim() !== '' : p.hasRate
        return { ...p, id, hasRate: priced }
      }),
    )
    if (!listId) {
      setListId(res.id)
      // Keep the address in step so a reload lands on this list, without a
      // navigation that would throw away what is on screen.
      window.history.replaceState(null, '', `/purchase-lists/${res.id}`)
    }
    setSavedAt(new Date())
    if (editSeq.current === seq) setDirty(false)
    return res.id
  }, [vendorId, buildInput, listId, isAdmin])

  // Autosave: a moment after the last change, once every photo is in.
  useEffect(() => {
    if (!dirty || saving || uploadsInFlight || !vendorId) return
    const t = setTimeout(() => void save(), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [dirty, saving, uploadsInFlight, vendorId, save])

  // Warn before leaving with unsaved typing.
  useEffect(() => {
    if (!dirty && !uploadsInFlight) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, uploadsInFlight])

  /** Every photo taken or picked becomes a piece on the list at once. */
  async function addPhotos(input: HTMLInputElement) {
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (files.length === 0) return

    const fresh = files.map(() => ({ ...blankPiece(), uploading: true }))
    setPieces((rows) => [...rows, ...fresh])
    touch()

    await Promise.all(
      files.map(async (file, i) => {
        const key = fresh[i].key
        try {
          const { path, preview } = await uploadPhoto(file)
          updatePiece(key, { photoPath: path, preview, uploading: false })
        } catch (e) {
          updatePiece(key, {
            uploading: false,
            uploadError: e instanceof Error ? e.message : 'Could not upload that photo.',
          })
        }
      }),
    )
    touch()
  }

  async function retakePhoto(key: string, input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const old = pieces.find((p) => p.key === key)?.photoPath
    updatePiece(key, { uploading: true, uploadError: null })
    try {
      const { path, preview } = await uploadPhoto(file)
      updatePiece(key, { photoPath: path, preview, uploading: false })
      await removePhoto(old)
    } catch (e) {
      updatePiece(key, {
        uploading: false,
        uploadError: e instanceof Error ? e.message : 'Could not upload that photo.',
      })
    }
    touch()
  }

  async function removePiece(key: string) {
    const piece = pieces.find((p) => p.key === key)
    setPieces((rows) => rows.filter((r) => r.key !== key))
    touch()
    if (piece?.photoPath) await removePhoto(piece.photoPath)
  }

  function makeOrder() {
    start(async () => {
      const id = listId && !dirty ? listId : await save()
      if (!id) return
      router.push(`/orders/new?list=${id}`)
    })
  }

  function confirmDelete() {
    start(async () => {
      if (listId) {
        const res = await deletePurchaseList(listId)
        if (!res.ok) {
          setSaveError(res.error)
          setDeleteOpen(false)
          return
        }
      }
      // Photos of a thrown-away draft are not needed by anything.
      await Promise.all(pieces.map((p) => removePhoto(p.photoPath)))
      router.push('/purchase-lists')
      router.refresh()
    })
  }

  const vendor = vendorList.find((v) => v.id === vendorId)
  const vendorName = vendor?.name

  /** What the PDF and the message need, from what is on screen right now. */
  function pdfInput(): ListPdfInput {
    return {
      from,
      vendor: {
        name: vendor?.name ?? 'Vendor',
        company_name: vendor?.company_name ?? null,
        contact_person: vendor?.contact_person ?? null,
        city: vendor?.city ?? null,
      },
      visitDate: formatDate(visitDate),
      notes: notes.trim() || null,
      pieces: pieces.map((p, i) => ({
        n: i + 1,
        product_name: p.product_name.trim() || `Piece ${i + 1}`,
        design_code: p.design_code.trim() || null,
        colour: p.colour.trim() || null,
        category: PRODUCT_CATEGORY_LABELS[p.category as ProductCategory] ?? p.category,
        quantity: Number(p.quantity) || 1,
        unit: p.unit,
        notes: p.notes.trim() || null,
        photoUrl: p.preview,
      })),
    }
  }

  return (
    <>
      <div className="space-y-4">
        <FieldGroup title="Where are you?">
          <Field label="Vendor's shop">
            <div className="flex gap-2">
              <Select
                value={vendorId}
                onChange={(e) => {
                  setVendorId(e.target.value)
                  touch()
                }}
                className="flex-1"
                required
              >
                <option value="">Choose the vendor…</option>
                {vendorList
                  .filter((v) => v.is_active || v.id === vendorId)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.city ? ` — ${v.city}` : ''}
                    </option>
                  ))}
              </Select>
              <Button type="button" variant="outline" onClick={() => setNewVendorOpen(true)}>
                <Plus className="size-4" />
                New
              </Button>
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date of visit">
              <Input
                type="date"
                value={visitDate}
                max={todayIST()}
                onChange={(e) => {
                  setVisitDate(e.target.value)
                  touch()
                }}
                required
              />
            </Field>
            <Field label="Notes" hint="optional">
              <Input
                value={notes}
                placeholder="e.g. Diwali picks, second floor"
                onChange={(e) => {
                  setNotes(e.target.value)
                  touch()
                }}
              />
            </Field>
          </div>
        </FieldGroup>

        {/* The two ways in — always both. The hidden inputs are what the
            phone actually opens. */}
        <input
          ref={cameraRef}
          type="file"
          accept={PHOTO_ACCEPT}
          capture="environment"
          className="sr-only"
          onChange={(e) => addPhotos(e.currentTarget)}
          aria-label="Take a photo of a piece"
        />
        <input
          ref={galleryRef}
          type="file"
          accept={PHOTO_ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => addPhotos(e.currentTarget)}
          aria-label="Choose photos of pieces from gallery or files"
        />

        <section className="card p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg text-charcoal">Pieces picked</h2>
            <p className="text-[13px] text-muted">
              {pieces.length === 0
                ? 'Nothing yet'
                : `${pieces.length} ${pieces.length === 1 ? 'piece' : 'pieces'} · ${totalPcs} pcs`}
            </p>
          </div>
          <p className="mt-0.5 text-[13px] text-muted">
            One photo per piece. Name and price can wait — the photo is what matters in the shop.
          </p>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex min-h-[64px] flex-1 items-center justify-center gap-2 rounded-md border border-gold/50 bg-gold-wash/40 px-3 text-[15px] font-semibold text-charcoal hover:bg-gold-wash"
            >
              <Camera className="size-6 text-gold" />
              Take photo
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex min-h-[64px] flex-1 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-[15px] font-semibold text-charcoal hover:bg-parchment"
            >
              <Images className="size-6 text-gold" />
              Gallery / files
            </button>
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            Each photo becomes a line below. From the gallery you can pick several at once.
          </p>

          {pieces.length > 0 && (
            <ol className="mt-4 space-y-3">
              {pieces.map((piece, idx) => (
                <PieceCard
                  key={piece.key}
                  piece={piece}
                  index={idx}
                  isAdmin={isAdmin}
                  onChange={(patch) => {
                    updatePiece(piece.key, patch)
                    touch()
                  }}
                  onRetake={(input) => retakePhoto(piece.key, input)}
                  onRemove={() => removePiece(piece.key)}
                />
              ))}
            </ol>
          )}
        </section>

        <ErrorNote>{saveError}</ErrorNote>

        {/* Save status + the two things you do when you are done. */}
        <div className="card space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <SaveStatus
              saving={saving || uploadsInFlight}
              dirty={dirty}
              savedAt={savedAt}
              hasVendor={!!vendorId}
            />
            <span className="text-muted">
              {piecesWithPhoto}/{pieces.length} with a photo · {pricedCount}/{pieces.length} priced
              {isAdmin && knownTotal > 0 && ` · ${formatMoney(knownTotal)} so far`}
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="sm:flex-1"
              disabled={saving || uploadsInFlight || !vendorId || (!dirty && !!listId)}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              {listId && !dirty ? 'Saved' : 'Save list'}
            </Button>
            <Button
              type="button"
              variant="gold"
              className="sm:flex-[2]"
              disabled={pending || saving || uploadsInFlight || pieces.length === 0 || !vendorId}
              onClick={makeOrder}
            >
              {pending ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
              Make an order from this list
            </Button>
          </div>
          <ListShareActions
            getInput={pdfInput}
            vendorPhone={vendor?.phone ?? null}
            vendorEmail={vendor?.email ?? null}
            disabled={uploadsInFlight || pieces.length === 0 || !vendorId}
            compact
          />

          <p className="text-[12px] leading-relaxed text-muted">
            Making the order takes these pieces into the Place order screen, where you add the lead
            time and raise the purchase order{vendorName ? ` for ${vendorName}` : ''}. You can also
            come back and finish this list another day — it is saved under{' '}
            <Link href="/purchase-lists" className="underline">
              Purchase lists
            </Link>
            .
          </p>

          {isAdmin && listId && (
            <div className="border-t border-line pt-3">
              <Button type="button" variant="quiet" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 />
                Throw this list away
              </Button>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={newVendorOpen}
        onOpenChange={setNewVendorOpen}
        title="Add a new vendor"
        description="They will be selected for this list automatically."
      >
        <VendorForm
          categories={categories}
          isAdmin={isAdmin}
          compact
          onSaved={(id, name) => {
            setVendorList((l) => [...l, { id, name, is_active: true } as Vendor])
            setVendorId(id)
            setNewVendorOpen(false)
            touch()
          }}
        />
      </Modal>

      <Modal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Throw this list away?"
        description="The photos and everything typed here are deleted. This cannot be undone."
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteOpen(false)}>
              Keep it
            </Button>
            <Button variant="danger" className="flex-1" onClick={confirmDelete} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Delete list
            </Button>
          </div>
        }
      >
        <p className="text-[14px] text-ink">
          {pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'} on this list
          {vendorName ? ` from ${vendorName}` : ''}.
        </p>
      </Modal>
    </>
  )
}

function SaveStatus({
  saving,
  dirty,
  savedAt,
  hasVendor,
}: {
  saving: boolean
  dirty: boolean
  savedAt: Date | null
  hasVendor: boolean
}) {
  if (!hasVendor) {
    return <span className="font-medium text-today">Choose a vendor and the list will save itself.</span>
  }
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <Loader2 className="size-4 animate-spin" />
        Saving…
      </span>
    )
  }
  if (dirty) return <span className="font-medium text-today">Unsaved changes</span>
  if (savedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-done">
        <Check className="size-4" />
        Saved {savedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
      </span>
    )
  }
  return <span className="text-muted">Not saved yet</span>
}

/** One photographed piece: thumbnail, the essentials, and more on request. */
function PieceCard({
  piece,
  index,
  isAdmin,
  onChange,
  onRetake,
  onRemove,
}: {
  piece: PieceRow
  index: number
  isAdmin: boolean
  onChange: (patch: Partial<PieceRow>) => void
  onRetake: (input: HTMLInputElement) => void
  onRemove: () => void
}) {
  const retakeCameraRef = useRef<HTMLInputElement>(null)
  const retakeGalleryRef = useRef<HTMLInputElement>(null)

  return (
    <li className="rounded-md border border-line bg-parchment/40 p-3">
      <div className="flex gap-3">
        {/* The photo — large enough to recognise the piece at a glance. */}
        <div className="shrink-0">
          {piece.uploading ? (
            <div className="flex size-24 items-center justify-center rounded-md border border-dashed border-gold/50 bg-gold-wash/40">
              <Loader2 className="size-5 animate-spin text-gold" />
            </div>
          ) : piece.preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={piece.preview}
              alt={piece.product_name || `Piece ${index + 1}`}
              className="size-24 rounded-md border border-line object-cover"
            />
          ) : (
            <div className="flex size-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line bg-white text-[11px] text-muted">
              <Camera className="size-5" />
              No photo
            </div>
          )}
          <input
            ref={retakeCameraRef}
            type="file"
            accept={PHOTO_ACCEPT}
            capture="environment"
            className="sr-only"
            onChange={(e) => onRetake(e.currentTarget)}
            aria-label={`Retake photo of piece ${index + 1}`}
          />
          <input
            ref={retakeGalleryRef}
            type="file"
            accept={PHOTO_ACCEPT}
            className="sr-only"
            onChange={(e) => onRetake(e.currentTarget)}
            aria-label={`Choose another photo for piece ${index + 1}`}
          />
          <div className="mt-1 flex justify-center gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => retakeCameraRef.current?.click()}
              className="text-muted underline-offset-2 hover:text-charcoal hover:underline"
            >
              Camera
            </button>
            <button
              type="button"
              onClick={() => retakeGalleryRef.current?.click()}
              className="text-muted underline-offset-2 hover:text-charcoal hover:underline"
            >
              Gallery
            </button>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">
              Piece {index + 1}
            </span>
            <button
              type="button"
              onClick={onRemove}
              className="tap -mr-2 -mt-2 rounded-md text-muted hover:text-overdue"
              aria-label={`Remove piece ${index + 1}`}
            >
              <Trash2 className="size-4" />
            </button>
          </div>

          <Input
            value={piece.product_name}
            onChange={(e) => onChange({ product_name: e.target.value })}
            placeholder="What is it? e.g. Red bridal lehenga"
          />

          <div className="grid grid-cols-2 gap-2">
            <Field label="Quantity">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={piece.quantity}
                onChange={(e) => onChange({ quantity: Number(e.target.value) || 1 })}
              />
            </Field>
            <Field label="Price ₹" hint="optional">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={piece.rate}
                onChange={(e) => onChange({ rate: e.target.value, rateTouched: true })}
                placeholder={!isAdmin && piece.hasRate ? 'noted' : 'later'}
              />
              {!isAdmin && piece.hasRate && !piece.rateTouched && (
                <p className="text-[11px] text-done">A price has been noted.</p>
              )}
            </Field>
          </div>
          {piece.uploadError && <p className="text-[12px] text-overdue">{piece.uploadError}</p>}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChange({ expanded: !piece.expanded })}
        className="mt-2 flex min-h-9 w-full items-center gap-1 text-left text-[13px] font-medium text-muted hover:text-charcoal"
      >
        {piece.expanded ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}
        <span className="shrink-0">{piece.expanded ? 'Fewer details' : 'More details'}</span>
        {!piece.expanded && (piece.design_code || piece.colour || piece.notes) && (
          <span className="min-w-0 truncate font-normal">
            · {[piece.design_code, piece.colour, piece.notes].filter(Boolean).join(' · ')}
          </span>
        )}
      </button>

      {piece.expanded && (
        <div className={cn('mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4')}>
          <Field label="Type">
            <Select value={piece.category} onChange={(e) => onChange({ category: e.target.value })}>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {PRODUCT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unit">
            <Select value={piece.unit} onChange={(e) => onChange({ unit: e.target.value })}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Design code">
            <Input
              value={piece.design_code}
              onChange={(e) => onChange({ design_code: e.target.value })}
              placeholder="e.g. BL-101"
            />
          </Field>
          <Field label="Colour">
            <Input value={piece.colour} onChange={(e) => onChange({ colour: e.target.value })} />
          </Field>
          <Field label="Note" className="col-span-2 sm:col-span-4">
            <Textarea
              value={piece.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="Anything to remember — alteration, size, who showed it"
              rows={2}
            />
          </Field>
        </div>
      )}
    </li>
  )
}
