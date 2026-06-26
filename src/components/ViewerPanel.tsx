import { useEffect, useRef } from 'react'
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color4,
  KhronosTextureContainer2,
} from '@babylonjs/core'
import { AppendSceneAsync } from '@babylonjs/core/Loading/sceneLoader'
import '@babylonjs/loaders/glTF'

import type { ILoadingScreen } from '@babylonjs/core'

export interface ViewerPanelProps {
  buffer: ArrayBuffer | null
  onCameraReady?: (camera: ArcRotateCamera | null) => void
}

// NoLoadingScreen è una implementazione vuota di ILoadingScreen per disabilitare il caricamento predefinito di BabylonJS.
class NoLoadingScreen implements ILoadingScreen {
  loadingUIBackgroundColor = ''
  loadingUIText = ''
  displayLoadingUI() {}
  hideLoadingUI() {}
}

let ktxConfigured = false
function ensureKtxTranscoder() {
  if (ktxConfigured) return
  ktxConfigured = true
  // babylon.ktx2Decoder.js (CDN UMD) + msc_basis_transcoder.js (Khronos v4.4.2)
  // sono la coppia compatibile: il decoder si aspetta MSC_TRANSCODER con UastcImageTranscoder ecc.
  KhronosTextureContainer2.URLConfig = {
    jsDecoderModule: '/wasm/babylon.ktx2Decoder.js',
    jsMSCTranscoder: '/wasm/msc_basis_transcoder.js',
    wasmMSCTranscoder: '/wasm/msc_basis_transcoder.wasm',
    wasmUASTCToASTC: null,
    wasmUASTCToBC7: null,
    wasmUASTCToRGBA_UNORM: null,
    wasmUASTCToRGBA_SRGB: null,
    wasmUASTCToR8_UNORM: null,
    wasmUASTCToRG8_UNORM: null,
    wasmZSTDDecoder: null,
  }
}

export function ViewerPanel({ buffer, onCameraReady }: ViewerPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const sceneRef  = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    ensureKtxTranscoder()

    const engine = new Engine(canvas, true, { antialias: true, stencil: true, adaptToDeviceRatio: true })

    engine.loadingScreen = new NoLoadingScreen();
    engineRef.current = engine

    const scene = new Scene(engine)
    sceneRef.current = scene
    scene.clearColor = new Color4(0.071, 0.071, 0.086, 1) // #121216

    const camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 3, 3.5, Vector3.Zero(), scene)
    camera.minZ = 0.01
    camera.inertia = 0.85
    camera.wheelPrecision = 150
    camera.pinchPrecision = 400
    camera.attachControl(canvas, true)
    cameraRef.current = camera
    onCameraReady?.(camera)

    const amb = new HemisphericLight('amb', new Vector3(0, 1, 0), scene)
    amb.intensity = 0.55
    const key = new DirectionalLight('key', new Vector3(3, 5, 4), scene)
    key.intensity = 1.05
    const fill = new DirectionalLight('fill', new Vector3(-4, -2, -3), scene)
    fill.diffuse.set(0.48, 0.36, 1)
    fill.intensity = 0.45

    engine.runRenderLoop(() => scene.render())

    const t0 = setTimeout(() => engine.resize(), 0)
    const ro = new ResizeObserver(() => engine.resize())
    ro.observe(canvas)

    return () => {
      clearTimeout(t0)
      ro.disconnect()
      onCameraReady?.(null)
      engine.stopRenderLoop()
      scene.dispose()
      engine.dispose()
      engineRef.current = null
      sceneRef.current  = null
      cameraRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const scene = sceneRef.current
    const cam   = cameraRef.current
    if (!scene || !cam) return

    scene.meshes.slice().forEach(m => m.dispose())
    scene.materials.slice().forEach(m => m.dispose())
    scene.textures.slice().forEach(t => t.dispose())

    if (!buffer) return

    let cancelled = false

    ;(async () => {
      const file = new File([buffer], 'model.glb', { type: 'model/gltf-binary' })
      try {
        await AppendSceneAsync(file, scene)
      } catch (e) {
        if (!cancelled) console.error('[ViewerPanel] load failed:', e)
        return
      }

      if (cancelled || scene.isDisposed) return

      scene.meshes.forEach(m => m.computeWorldMatrix(true))
      await new Promise<void>(r => requestAnimationFrame(() => r()))

      if (cancelled || scene.isDisposed) return

      try {
        const visible = scene.meshes.filter(m => m.isVisible && m.isEnabled() && m.getTotalVertices() > 0)
        if (visible.length > 0) {
          let xMin = Infinity, yMin = Infinity, zMin = Infinity
          let xMax = -Infinity, yMax = -Infinity, zMax = -Infinity
          for (const m of visible) {
            const bi = m.getBoundingInfo()
            const mn = bi.boundingBox.minimumWorld
            const mx = bi.boundingBox.maximumWorld
            if (mn.x < xMin) xMin = mn.x; if (mx.x > xMax) xMax = mx.x
            if (mn.y < yMin) yMin = mn.y; if (mx.y > yMax) yMax = mx.y
            if (mn.z < zMin) zMin = mn.z; if (mx.z > zMax) zMax = mx.z
          }
          const size = Math.sqrt((xMax - xMin) ** 2 + (yMax - yMin) ** 2 + (zMax - zMin) ** 2)
          cam.target.set((xMin + xMax) / 2, (yMin + yMax) / 2, (zMin + zMax) / 2)
          cam.radius = Math.max(size, 0.01) * 1.2
        }
      } catch { /* camera resta nella posizione di default */ }
      cam.alpha = Math.PI / 4
      cam.beta  = Math.PI / 3
    })()

    return () => { cancelled = true }
  }, [buffer])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        width: '100%', height: '100%',
        touchAction: 'none',
        pointerEvents: buffer ? 'auto' : 'none',
      }}
    />
  )
}
