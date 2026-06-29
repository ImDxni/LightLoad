import { useCallback, useRef, useState } from 'react'
import type { OptimizationOptions, WorkerResponse, GLBMetrics } from '../types/pipeline'
import OptimizerWorker from '../workers/optimizer.worker?worker'
import i18n from '../i18n'

export type OptimizationState =
  | { phase: 'idle' }
  | { phase: 'running'; message: string; percent: number }
  | { phase: 'done'; optimizedBuffer: ArrayBuffer; metrics: GLBMetrics; warnings: string[] }
  | { phase: 'error'; message: string }

export function useOptimizer() {
  const [state, setState] = useState<OptimizationState>({ phase: 'idle' })
  const workerRef = useRef<Worker | null>(null)

  const optimize = useCallback(
    (buffer: ArrayBuffer, options: OptimizationOptions) => {
      // Terminate the previous worker if it is still running
      workerRef.current?.terminate()

      const worker = new OptimizerWorker()
      workerRef.current = worker

      const warnings: string[] = []

      setState({ phase: 'running', message: i18n.t('progress.init'), percent: 0 })

      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const msg = ev.data
        switch (msg.type) {
          case 'progress':
            setState({ phase: 'running', message: msg.message, percent: msg.percent })
            break

          case 'warning':
            warnings.push(msg.message)
            break

          case 'success':
            worker.terminate()
            workerRef.current = null
            setState({
              phase: 'done',
              optimizedBuffer: msg.buffer,
              metrics: msg.metrics,
              warnings: [...warnings],
            })
            break

          case 'error':
            worker.terminate()
            workerRef.current = null
            setState({ phase: 'error', message: msg.message })
            break
        }
      }

      worker.onerror = (err) => {
        worker.terminate()
        workerRef.current = null
        setState({ phase: 'error', message: err.message ?? i18n.t('errors.unknownWorker') })
      }

      // Transfer the buffer to the worker (zero-copy)
      worker.postMessage({ type: 'optimize', buffer, options, lng: i18n.language }, [buffer])
    },
    [],
  )

  const reset = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    setState({ phase: 'idle' })
  }, [])

  return { state, optimize, reset }
}
