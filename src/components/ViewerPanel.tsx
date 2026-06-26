/**
 * Viewer 3D singolo basato su Babylon.js.
 * Espone un ref alla camera ArcRotate per sincronizzazione esterna.
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  Color4,
  SceneLoader,
  KhronosTextureContainer2,
} from '@babylonjs/core'
import '@babylonjs/loaders/glTF'
import styles from './ViewerPanel.module.css'

export interface ViewerHandle {
  camera: ArcRotateCamera | null
  scene: Scene | null
  loadGlb: (buffer: ArrayBuffer) => Promise<void>
}

interface Props {
  label: string
  /** Se true, il canvas è visibile ma il modello non è ancora caricato */
  empty?: boolean
}

// Configura una volta il transcoder KTX2 di BabylonJS
let ktxConfigured = false
function ensureKtxTranscoder() {
  if (ktxConfigured) return
  ktxConfigured = true
  KhronosTextureContainer2.URLConfig = {
    jsDecoderModule: '/wasm/basis_transcoder.js',
    wasmFallback: '/wasm/basis_transcoder.wasm',
  }
}

export const ViewerPanel = forwardRef<ViewerHandle, Props>(({ label, empty }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)

  useImperativeHandle(ref, () => ({
    get camera() { return cameraRef.current },
    get scene() { return sceneRef.current },
    loadGlb: async (buffer: ArrayBuffer) => {
      if (!sceneRef.current) return
      // Rimuove mesh precedenti
      sceneRef.current.meshes.slice().forEach((m) => m.dispose())
      sceneRef.current.materials.slice().forEach((m) => m.dispose())
      sceneRef.current.textures.slice().forEach((t) => t.dispose())

      // Carica da buffer in memoria
      const blob = new Blob([buffer], { type: 'model/gltf-binary' })
      const url = URL.createObjectURL(blob)
      try {
        await SceneLoader.AppendAsync(url, '', sceneRef.current, undefined, '.glb')
      } finally {
        URL.revokeObjectURL(url)
      }

      // Reimposta la camera sul bounding box del modello
      const camera = cameraRef.current
      if (camera) {
        const meshes = sceneRef.current.meshes.filter((m) => m.getTotalVertices() > 0)
        if (meshes.length > 0) {
          // WorldExtends include tutti i mesh
          const { min, max } = sceneRef.current.getWorldExtends(
            (m) => m.isVisible && m.isEnabled(),
          )
          const center = Vector3.Center(min, max)
          const size = max.subtract(min).length()
          camera.target = center
          camera.radius = size * 1.2
          camera.alpha = Math.PI / 4
          camera.beta = Math.PI / 3
        }
      }
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    ensureKtxTranscoder()

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
    })
    engineRef.current = engine

    const scene = new Scene(engine)
    sceneRef.current = scene
    scene.clearColor = new Color4(0.07, 0.07, 0.09, 1)

    const camera = new ArcRotateCamera('cam', Math.PI / 4, Math.PI / 3, 4, Vector3.Zero(), scene)
    camera.lowerRadiusLimit = 0.1
    camera.wheelPrecision = 50
    camera.attachControl(canvas, true)
    cameraRef.current = camera

    const light = new HemisphericLight('light', new Vector3(1, 1, 0), scene)
    light.intensity = 1.2

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
    <div className={styles.panel}>
      <div className={styles.labelBadge}>{label}</div>
      {empty && <div className={styles.emptyOverlay}>Nessun modello caricato</div>}
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
})

ViewerPanel.displayName = 'ViewerPanel'
