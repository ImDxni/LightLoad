import { useCallback, useState } from 'react'
import styles from './DropZone.module.css'

interface Props {
  onFile: (buffer: ArrayBuffer, filename: string) => void
}

export function DropZone({ onFile }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFile = useCallback(
    (file: File) => {
      setError(null)
      if (!file.name.toLowerCase().endsWith('.glb')) {
        setError('Solo file .glb sono supportati.')
        return
      }
      const reader = new FileReader()
      reader.onload = (e) => {
        const buf = e.target?.result as ArrayBuffer
        if (!buf || buf.byteLength < 12) {
          setError('File .glb non valido o troppo piccolo.')
          return
        }
        // Verifica magic GLB: 0x46546C67 ('glTF')
        const magic = new DataView(buf).getUint32(0, true)
        if (magic !== 0x46546c67) {
          setError('Il file non è un GLB valido (magic header errato).')
          return
        }
        onFile(buf, file.name)
      }
      reader.readAsArrayBuffer(file)
    },
    [onFile],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile],
  )

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      e.target.value = ''
    },
    [processFile],
  )

  return (
    <div
      className={`${styles.zone} ${dragOver ? styles.over : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        type="file"
        accept=".glb"
        id="glb-input"
        className={styles.fileInput}
        onChange={onInputChange}
      />
      <label htmlFor="glb-input" className={styles.label}>
        <span className={styles.icon}>📦</span>
        <strong>Trascina un file .glb qui</strong>
        <span>oppure clicca per selezionarlo</span>
      </label>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
