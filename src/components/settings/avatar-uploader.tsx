'use client'

/**
 * Avatar uploader for /settings/account. Pick a file -> validate type/size ->
 * open a crop Dialog (react-easy-crop, circular mask, zoom + pan) -> on Save,
 * export a 512x512 webp via getCroppedImageBlob, upload() it to the avatar
 * upload route, then updateMyAvatarAction(result.url) and refresh. A Remove
 * button shows when an avatar already exists.
 */

import { useRef, useState, useCallback, useEffect, useTransition } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { upload } from '@vercel/blob/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { initials } from '@/lib/initials'
import { buildAvatarBlobPathname } from '@/lib/avatar'
import { getCroppedImageBlob } from '@/lib/avatar-crop'
import {
  updateMyAvatarAction,
  removeMyAvatarAction,
} from '@/app/(app)/settings/account/actions'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp']

export interface AvatarUploaderProps {
  userDbId: string
  name: string
  avatarUrl: string | null
}

export function AvatarUploader({ userDbId, name, avatarUrl }: AvatarUploaderProps) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixels, setPixels] = useState<Area | null>(null)
  const [pending, startTransition] = useTransition()

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setPixels(areaPixels)
  }, [])

  // Revoke the object URL for the previous image whenever it is replaced or
  // cleared (and on unmount), so picking/cancelling repeatedly doesn't leak.
  useEffect(() => {
    if (!imageSrc) return
    return () => URL.revokeObjectURL(imageSrc)
  }, [imageSrc])

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED.includes(file.type)) {
      toast.error('Use a PNG, JPG, or WebP image.')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image must be under 5MB.')
      return
    }
    setImageSrc(URL.createObjectURL(file))
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setPixels(null)
  }

  function save() {
    if (!imageSrc || !pixels) return
    startTransition(async () => {
      try {
        const blob = await getCroppedImageBlob(imageSrc, pixels, 512)
        const pathname = buildAvatarBlobPathname(userDbId, 'avatar.webp')
        const result = await upload(pathname, blob, {
          access: 'public',
          handleUploadUrl: '/api/account/avatar/upload',
          contentType: 'image/webp',
        })
        await updateMyAvatarAction(result.url)
        setImageSrc(null)
        toast.success('Profile photo updated.')
        router.refresh()
      } catch (err) {
        console.error(err)
        toast.error('Could not update your photo. Try again.')
      }
    })
  }

  function remove() {
    startTransition(async () => {
      try {
        await removeMyAvatarAction()
        toast.success('Profile photo removed.')
        router.refresh()
      } catch {
        toast.error('Could not remove your photo.')
      }
    })
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInput.current?.click()}
            disabled={pending}
          >
            {avatarUrl ? 'Change photo' : 'Upload photo'}
          </Button>
          {avatarUrl && (
            <Button type="button" variant="ghost" onClick={remove} disabled={pending}>
              Remove
            </Button>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground">
          PNG, JPG, or WebP. Up to 5MB.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept={ALLOWED.join(',')}
          onChange={pickFile}
          className="hidden"
        />
      </div>

      <Dialog open={imageSrc !== null} onOpenChange={(o) => !o && setImageSrc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Position your photo</DialogTitle>
          </DialogHeader>
          <div className="relative h-72 w-full bg-neutral-900">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="w-full"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setImageSrc(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={pending || !pixels}>
              {pending ? 'Saving…' : 'Save photo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AvatarUploader
