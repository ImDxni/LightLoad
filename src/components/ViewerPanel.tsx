/**
 * Viewer 3D Babylon.js — solo il canvas, senza wrapper card.
 * Il card shell (header, footer) è gestito da App.tsx.
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  Vector3,
  Color4,
  SceneLoader,
  KhronosTextureContainer2,
} from '@babylonjs/core'
import '@babylonjs/loaders/glTF'

export interface ViewerHandle {
  camera: ArcRotateCamera | null
  scene: Scene | null
  loadGlb: (buffer: ArrayBuffer) => Promise<void>
}

let ktxConfigured = false
function ensureKtxTranscoder() {
  if (ktxConfigured) return
  ktxConfigured = true
  KhronosTextureContainer2.URLConfig = {
    jsDecoderModule: '/wasm/basis_transcoder.js',
    wasmFallback: '/wasm/basis_transcoder.wasm',
  }
}

export const ViewerPanel = forwardRef<ViewerHandle>((_props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)

  useImperativeHandle(ref, () => ({
    get camera() { return cameraRef.current },
    get scene() { return sceneRef.current },
    loadGlb: async (buffer: ArrayBuffer) => {
      if (!sceneRef.current) return
      // Rimuove mesh/materiali precedenti
      sceneRef.current.meshes.slice().forEach(m => m.dispose())
      sceneRef.current.materials.slice().forEach(m => m.dispose())
      sceneRef.current.textures.slice().forEach(t => t.dispose())

      const blob = new Blob([buffer], { type: 'model/gltf-binary' })
      const url = URL.createObjectURL(blob)
      try {
        await SceneLoader.AppendAsync(url, '', sceneRef.current, undefined, '.glb')
      } finally {
        URL.revokeObjectURL(url)
      }

      // Reimposta camera sul bounding box del modello
      const cam = cameraRef.current
      if (cam && sceneRef.current) {
        const { min, max } = sceneRef.current.getWorldExtends(m => m.isVisible && m.isEnabled())
        const center = Vector3.Center(min, max)
        const size = max.subtract(min).length()
        cam.target = center
        cam.radius = size * 1.2
        cam.alpha = Math.PI / 4
        cam.beta = Math.PI / 3
      }
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    ensureKtxTranscoder()

    const engine = new Engine(canvas, true, { antialias: true, stencil: true })
    engineRef.current = engine

    const scene = new Scene(engine)
    sceneRef.current = scene
    scene.clearColor = new Color4(0.071, 0.071, 0.086, 1) // #121216

    const camera = new ArcRotateCamera('cam', Math.PI / 4, Math.PI / 3, 5, Vector3.Zero(), scene)
    camera.lowerRadiusLimit = 0.1
    camera.wheelPrecision = 50
    camera.attachControl(canvas, true)
    cameraRef.current = camera

    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
    ambient.intensity = 0.55

    const key = new DirectionalLight('key', new Vector3(3, 5, 4), scene)
    key.intensity = 1.05

    const fill = new DirectionalLight('fill', new Vector3(-4, -2, -3), scene)
    fill.diffuse.set(0.48, 0.36, 1) // leggero tint viola
    fill.intensity = 0.45

    engine.runRenderLoop(() => scene.render())

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      engine.stopRenderLoop()
      scene.dispose()
      engine.dispose()
      engineRef.current = null
      sceneRef.current = null
      cameraRef.current = null
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
})

ViewerPanel.displayName = 'ViewerPanel'
