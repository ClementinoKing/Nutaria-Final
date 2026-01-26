import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { X, Camera, RotateCcw, Check, Loader2 } from 'lucide-react'

interface CameraCaptureProps {
  isOpen: boolean
  onClose: () => void
  onCapture: (file: File) => void
  disabled?: boolean
}

export function CameraCapture({ isOpen, onClose, onCapture, disabled }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)

  useEffect(() => {
    if (isOpen && !disabled) {
      startCamera()
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [isOpen, disabled])

  // Handle video element when stream is available
  useEffect(() => {
    if (stream && videoRef.current) {
      const video = videoRef.current
      
      // Ensure video element has the stream
      if (video.srcObject !== stream) {
        video.srcObject = stream
      }

      // Ensure video is playing
      if (video.paused && video.readyState >= 2) {
        video.play().catch((err) => {
          console.error('Error playing video in effect:', err)
        })
      }
    }
  }, [stream])

  const startCamera = async () => {
    setError(null)
    setLoading(true)
    setCapturedImage(null)
    setHasPermission(null)

    try {
      // Check if camera API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'Camera access is not available in this browser. Please use a modern browser with camera support.'
        )
      }

      // Check if we're in a secure context (HTTPS or localhost)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        throw new Error(
          'Camera access requires a secure connection (HTTPS). Please access this page over HTTPS.'
        )
      }

      // Request camera access
      // Prefer rear camera on mobile, default on desktop
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment', // Rear camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      setStream(mediaStream)
      setHasPermission(true)

      // Attach stream to video element
      if (videoRef.current) {
        const video = videoRef.current
        
        // Set the stream
        video.srcObject = mediaStream

        // Wait for video to be ready, then play
        const handleCanPlay = async () => {
          try {
            await video.play()
            setLoading(false)
            console.log('Video is playing successfully')
          } catch (err) {
            console.error('Error playing video:', err)
            setError('Failed to start camera preview. Please try again.')
            setLoading(false)
            stopCamera()
          }
        }

        const handleError = (e: Event) => {
          console.error('Video element error:', e)
          setError('Failed to load camera stream.')
          setLoading(false)
          stopCamera()
        }

        // Listen for when video is ready to play
        video.addEventListener('canplay', handleCanPlay, { once: true })
        video.addEventListener('error', handleError, { once: true })

        // Also try playing immediately (for browsers that support it)
        video.play().catch(() => {
          // If immediate play fails, canplay event will handle it
          console.log('Immediate play failed, waiting for canplay event')
        })
      } else {
        setLoading(false)
      }
    } catch (err) {
      console.error('Error accessing camera:', err)
      setLoading(false)
      setHasPermission(false)

      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera permission was denied. Please allow camera access in your browser settings and try again.')
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('No camera found on this device. Please connect a camera and try again.')
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setError('Camera is already in use by another application. Please close other applications using the camera and try again.')
        } else {
          setError(err.message || 'Failed to access camera. Please try again.')
        }
      } else {
        setError('An unexpected error occurred while accessing the camera.')
      }
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop()
      })
      setStream(null)
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setCapturedImage(null)
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !stream) {
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw current video frame to canvas
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
      setCapturedImage(dataUrl)
    }
  }

  const retakePhoto = () => {
    setCapturedImage(null)
  }

  const confirmCapture = async () => {
    if (!canvasRef.current || !capturedImage) {
      return
    }

    try {
      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvasRef.current?.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Failed to create image blob'))
            }
          },
          'image/jpeg',
          0.95
        )
      })

      // Create File object
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })

      // Call onCapture callback
      onCapture(file)

      // Cleanup and close
      stopCamera()
      onClose()
    } catch (err) {
      console.error('Error converting image to file:', err)
      setError('Failed to process the captured image. Please try again.')
    }
  }

  const handleClose = () => {
    stopCamera()
    setError(null)
    setCapturedImage(null)
    onClose()
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text-dark">Take Photo</h2>
            <p className="text-sm text-text-dark/70">Capture a photo using your device camera</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-text-dark hover:bg-olive-light/10"
            disabled={loading}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-12 w-12 animate-spin text-olive-dark" />
                <p className="text-sm text-text-dark/70">Accessing camera...</p>
              </div>
            </div>
          )}

          {!loading && hasPermission === false && !error && (
            <div className="flex flex-col items-center justify-center py-12">
              <Camera className="h-16 w-16 text-text-dark/30 mb-4" />
              <p className="text-sm text-text-dark/70 mb-4">Camera access is required to take photos.</p>
              <Button onClick={startCamera} variant="outline">
                Try Again
              </Button>
            </div>
          )}

          {!loading && hasPermission && !capturedImage && stream && (
            <div className="space-y-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black" style={{ minHeight: '300px' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-contain"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
              <div className="flex justify-center">
                <Button
                  onClick={capturePhoto}
                  className="bg-olive hover:bg-olive-dark"
                  size="lg"
                >
                  <Camera className="mr-2 h-5 w-5" />
                  Capture Photo
                </Button>
              </div>
            </div>
          )}

          {capturedImage && (
            <div className="space-y-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                <img
                  src={capturedImage}
                  alt="Captured photo"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex justify-center gap-3">
                <Button onClick={retakePhoto} variant="outline">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Retake
                </Button>
                <Button onClick={confirmCapture} className="bg-olive hover:bg-olive-dark">
                  <Check className="mr-2 h-4 w-4" />
                  Use Photo
                </Button>
              </div>
            </div>
          )}

          {/* Hidden canvas for image processing */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </div>
  )
}
