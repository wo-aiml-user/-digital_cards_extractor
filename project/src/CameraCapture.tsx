import React, { useEffect, useRef, useState } from "react";

interface CameraCaptureProps {
  onCancel: () => void;
  onCaptureComplete: (imageData: string) => void;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({
  onCancel,
  onCaptureComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    "environment"
  );
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const initCamera = async () => {
      await startCamera();
      if (!isMounted) {
        stopCamera();
      }
    };
    
    initCamera();
    
    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [facingMode]);

  // 🎥 Start Camera
  const startCamera = async () => {
    try {
      let mediaStream: MediaStream | null = null;
      
      // First try with the specified facing mode
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: facingMode,
            width: { ideal: 780 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (facingModeError) {
        console.warn("Couldn't access camera with exact facing mode, trying with ideal");
        // If that fails, try with ideal (less strict)
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });
        } catch (idealError) {
          console.warn("Couldn't access camera with ideal facing mode, trying any camera");
          // If that fails too, try with any camera
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });
        }
      }
      
      setStream(mediaStream);
      
      // Set up video element
      if (videoRef.current && mediaStream) {
        videoRef.current.srcObject = mediaStream;
        // Wait for the video to be ready to play
        await new Promise((resolve) => {
          if (videoRef.current) {
            const onLoaded = () => {
              videoRef.current?.play()
                .then(resolve)
                .catch(err => {
                  console.error("Error playing video:", err);
                  resolve(undefined);
                });
            };
            
            if (videoRef.current.readyState >= 3) { // HAVE_FUTURE_DATA
              onLoaded();
            } else {
              videoRef.current.onloadeddata = onLoaded;
            }
          }
        });
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert(`Could not access the camera: ${err instanceof Error ? err.message : 'Unknown error'}. Please check permissions and try again.`);
    }
  };

  // 🧹 Stop Camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        stream.removeTrack(track);
      });
      setStream(null);
      
      // Clear video source
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  };

  // ⚡ Flash Toggle (for devices that support torch mode)
  const toggleFlash = async () => {
    const videoTrack = stream?.getVideoTracks()[0];
    if (videoTrack) {
      try {
        // @ts-ignore - Some browsers support torch mode
        const capabilities = videoTrack.getCapabilities?.();
        // @ts-ignore - Check for torch support
        if (capabilities?.torch) {
          // @ts-ignore - Apply torch constraint
          await videoTrack.applyConstraints({
            advanced: [{ torch: !flashOn }]
          });
          setFlashOn(!flashOn);
        } else {
          alert("Flash not supported on this device");
        }
      } catch (err) {
        console.warn('Flash/torch mode not supported:', err);
        alert("Flash not supported on this device");
      }
    }
  };

  // 📸 Capture Frame (cropped to on-screen guide: 80% width x 2/3 height, centered)
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;

    const frameW = video.videoWidth;
    const frameH = video.videoHeight;
    if (!frameW || !frameH) return;

    // Crop rectangle matches the guide overlay proportions
    const cropW = Math.floor(frameW * 0.8);
    const cropH = Math.floor(frameH * (2 / 3));
    const cropX = Math.floor((frameW - cropW) / 2);
    const cropY = Math.floor((frameH - cropH) / 2);

    // Use offscreen canvas for the crop
    const off = document.createElement("canvas");
    off.width = cropW;
    off.height = cropH;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;

    offCtx.drawImage(
      video,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      cropW,
      cropH
    );

    const imageData = off.toDataURL("image/jpeg", 0.95);
    setCapturedImage(imageData);
    stopCamera();
  };

  // 🔁 Retake Photo
  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  // ✅ Confirm & Send to OCR
  const confirmPhoto = () => {
    if (capturedImage) {
      onCaptureComplete(capturedImage);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {!capturedImage ? (
        <>
          <div className="flex-grow relative flex items-center justify-center bg-black">
            {!stream ? (
              <div className="text-white text-center p-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p>Initializing camera...</p>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                  style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                />
                {/* Overlay guide like CamScanner */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-4 border-green-400 rounded-lg w-4/5 h-2/3 bg-transparent"></div>
                </div>
              </>
            )}
          </div>

          {/* Camera Controls */}
          <div className="absolute bottom-6 left-0 right-0 flex items-center justify-between px-8">
            <button
              onClick={onCancel}
              className="bg-gray-800 px-4 py-2 rounded-full text-white"
            >
              ✖ Back
            </button>

            <button
              onClick={capturePhoto}
              className="w-16 h-16 bg-white rounded-full border-4 border-gray-400 shadow-lg"
              disabled={!stream}
            />

            <div className="flex gap-3">
              <button
                onClick={toggleFlash}
                className="bg-gray-800 px-4 py-2 rounded-full text-white"
              >
                ⚡ {flashOn ? 'On' : 'Off'}
              </button>
              <button
                onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                className="bg-gray-800 px-4 py-2 rounded-full text-white"
              >
                🔁
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center w-full h-full bg-black">
          <img
            src={capturedImage}
            alt="Captured"
            className="object-contain w-full h-[80vh]"
          />
          <div className="absolute bottom-6 flex gap-4">
            <button
              onClick={retakePhoto}
              className="bg-gray-700 px-5 py-2 rounded-full text-white"
            >
              🔄 Retake
            </button>
            <button
              onClick={confirmPhoto}
              className="bg-green-600 px-5 py-2 rounded-full text-white"
            >
              ✅ Use Photo
            </button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden"></canvas>
    </div>
  );
};

export default CameraCapture;
