/**
 * Script di setup: copia i file WASM da node_modules e scarica libktx da KhronosGroup.
 * Esegui con: npm run setup:wasm
 */

import { copyFileSync, mkdirSync, existsSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const outDir = resolve(root, 'public', 'wasm')

mkdirSync(outDir, { recursive: true })

function copy(src, dest) {
  if (!existsSync(src)) { console.warn(`⚠  Non trovato: ${src}`); return }
  copyFileSync(src, dest)
  console.log(`✓  ${dest.replace(root, '.')}`)
}

// ── File da node_modules ─────────────────────────────────────────────────────
const babylonAssets = resolve(dirname(require.resolve('@babylonjs/core')), '..', 'assets')
copy(resolve(babylonAssets, 'Basis', 'basis_transcoder.js'),   resolve(outDir, 'basis_transcoder.js'))
copy(resolve(babylonAssets, 'Basis', 'basis_transcoder.wasm'), resolve(outDir, 'basis_transcoder.wasm'))
// babylon.ktx2Decoder.js e msc_basis_transcoder.{js,wasm} vengono scaricati automaticamente
// dalla sezione CDN più sotto nello script.

const dracoDir = dirname(require.resolve('draco3d'))
copy(resolve(dracoDir, 'draco_encoder_nodejs.js'), resolve(outDir, 'draco_encoder.js'))  // encoder glue JS
copy(resolve(dracoDir, 'draco_decoder_nodejs.js'), resolve(outDir, 'draco_decoder.js'))  // decoder glue JS
copy(resolve(dracoDir, 'draco_encoder.wasm'),      resolve(outDir, 'draco_encoder.wasm'))
copy(resolve(dracoDir, 'draco_decoder.wasm'),      resolve(outDir, 'draco_decoder.wasm'))

// ── libktx da KhronosGroup (encoder KTX2) ───────────────────────────────────
const libktxJs   = resolve(outDir, 'libktx.js')
const libktxWasm = resolve(outDir, 'libktx.wasm')

if (existsSync(libktxJs) && existsSync(libktxWasm)) {
  console.log('✓  ./public/wasm/libktx.js  (già presente)')
  console.log('✓  ./public/wasm/libktx.wasm  (già presente)')
} else {
  console.log('\n⬇  Scarico libktx da KhronosGroup v4.4.2…')
  const VERSION = '4.4.2'
  const ZIP_URL = `https://github.com/KhronosGroup/KTX-Software/releases/download/v${VERSION}/KTX-Software-${VERSION}-Web-libktx.zip`

  try {
    const res = await fetch(ZIP_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const zipBuf = await res.arrayBuffer()

    // Estrai con DecompressionStream (Node 22+) o fallback a unzip CLI
    try {
      const { default: JSZip } = await import('jszip').catch(() => { throw new Error('jszip non installato') })
      const zip = await JSZip.loadAsync(zipBuf)
      for (const [filename, file] of Object.entries(zip.files)) {
        if (filename === 'libktx.js')   writeFileSync(libktxJs,   Buffer.from(await file.async('arraybuffer')))
        if (filename === 'libktx.wasm') writeFileSync(libktxWasm, Buffer.from(await file.async('arraybuffer')))
      }
    } catch {
      // Fallback: scrivi lo zip e chiedi all'utente di estrarlo
      const zipPath = resolve(outDir, 'libktx-download.zip')
      writeFileSync(zipPath, Buffer.from(zipBuf))
      console.log(`\n⚠  ZIP scaricato in ${zipPath.replace(root, '.')}`)
      console.log('   Estrai manualmente libktx.js e libktx.wasm in public/wasm/')
    }

    if (existsSync(libktxJs) && existsSync(libktxWasm)) {
      console.log('✓  ./public/wasm/libktx.js')
      console.log('✓  ./public/wasm/libktx.wasm')
    }
  } catch (e) {
    console.warn(`⚠  Download fallito: ${e.message}`)
    console.warn('   Scarica manualmente da:')
    console.warn(`   ${ZIP_URL}`)
    console.warn('   ed estrai libktx.js e libktx.wasm in public/wasm/')
  }
}


// ── Decoder KTX2 di Babylon (Web Worker) ────────────────────────────────────
const babylonDecoderJs = resolve(outDir, 'babylon.ktx2Decoder.js')

if (existsSync(babylonDecoderJs)) {
  console.log('✓  ./public/wasm/babylon.ktx2Decoder.js  (già presente)')
} else {
  console.log('\n⬇  Scarico babylon.ktx2Decoder.js da CDN ufficiale...')
  const DECODER_URL = 'https://cdn.babylonjs.com/babylon.ktx2Decoder.js'

  try {
    // Top-level await è supportato se il file è un modulo (come sembra dal tuo import.meta)
    const res = await fetch(DECODER_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    
    // Essendo un file JS di testo, text() è sufficiente
    const text = await res.text()
    writeFileSync(babylonDecoderJs, text)
    console.log('✓  ./public/wasm/babylon.ktx2Decoder.js')
  } catch (e) {
    console.warn(`⚠  Download fallito: ${e.message}`)
    console.warn('   Scarica manualmente da:')
    console.warn(`   ${DECODER_URL}`)
    console.warn('   e salvalo come babylon.ktx2Decoder.js in public/wasm/')
  }
}

console.log('\n✅ Setup WASM completato.')
