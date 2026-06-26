/**
 * Affianca due ViewerPanel (prima/dopo) con camere sincronizzate.
 * La sincronizzazione è gestita tramite observer BabylonJS:
 * quando la camera di uno si muove, copiamo i parametri all'altra.
 */
import { useRef, useEffect } from 'react'
import type { Observer } from '@babylonjs/core'
import type { ArcRotateCamera } from '@babylonjs/core'
import { ViewerPanel } from './ViewerPanel'
import type { ViewerHandle } from './ViewerPanel'
import styles from './DualViewer.module.css'

interface Props {
  beforeBuffer: ArrayBuffer | null
  afterBuffer: ArrayBuffer | null
}

export function DualViewer({ beforeBuffer, afterBuffer }: Props) {
  const beforeRef = useRef<ViewerHandle>(null)
  const afterRef = useRef<ViewerHandle>(null)
  const syncingRef = useRef(false)
  // Ref per cleanup degli observer attivi
  const obsARef = useRef<Observer<ArcRotateCamera> | null>(null)
  const obsBRef = useRef<Observer<ArcRotateCamera> | null>(null)

  // Crea un observer di sincronizzazione fra due ArcRotateCamera
  function attachSync(src: ArcRotateCamera, dst: ArcRotateCamera) {
    return src.onViewMatrixChangedObservable.add(() => {
      if (syncingRef.current) return
      syncingRef.current = true
      dst.alpha = src.alpha
      dst.beta = src.beta
      dst.radius = src.radius
      dst.target.copyFrom(src.target)
      syncingRef.current = false
    })
  }

  // Carica il modello "before"
  useEffect(() => {
    if (beforeBuffer && beforeRef.current) {
      beforeRef.current.loadGlb(beforeBuffer)
    }
  }, [beforeBuffer])

  // Carica il modello "after" e (ri)connette la sincronizzazione camera
  useEffect(() => {
    if (!afterBuffer || !afterRef.current) return

    // Disconnette observer precedenti
    const camBefore = beforeRef.current?.camera
    const camAfter = afterRef.current?.camera
    if (camBefore && obsARef.current) {
      camBefore.onViewMatrixChangedObservable.remove(obsARef.current)
      obsARef.current = null
    }
    if (camAfter && obsBRef.current) {
      camAfter.onViewMatrixChangedObservable.remove(obsBRef.current)
      obsBRef.current = null
    }

    afterRef.current.loadGlb(afterBuffer).then(() => {
      const cb = beforeRef.current?.camera
      const ca = afterRef.current?.camera
      if (!cb || !ca) return
      obsARef.current = attachSync(cb, ca)
      obsBRef.current = attachSync(ca, cb)
    })

    return () => {
      // cleanup se il componente viene smontato
      const cb = beforeRef.current?.camera
      const ca = afterRef.current?.camera
      if (cb && obsARef.current) cb.onViewMatrixChangedObservable.remove(obsARef.current)
      if (ca && obsBRef.current) ca.onViewMatrixChangedObservable.remove(obsBRef.current)
    }
  }, [afterBuffer])

  return (
    <div className={styles.row}>
      <ViewerPanel
        ref={beforeRef}
        label="Originale"
        empty={!beforeBuffer}
      />
      <ViewerPanel
        ref={afterRef}
        label="Ottimizzato"
        empty={!afterBuffer}
      />
    </div>
  )
}
