# LightLoad — GLB Optimizer

Ottimizzatore 3D **100% client-side**: compressione geometria (Draco) e texture (KTX2/Basis Universal) direttamente nel browser. Nessun file lascia mai il tuo dispositivo.

## Avvio rapido

```bash
npm install
npm run setup:wasm   # scarica e copia tutti i file WASM necessari
npm run dev
```

Naviga su `http://localhost:5173`, trascina un `.glb` e ottimizza.

Il comando `setup:wasm`:
- copia automaticamente i file WASM da `node_modules` (BabylonJS transcoder, Draco encoder/decoder)
- **scarica automaticamente** `libktx.js` + `libktx.wasm` da KhronosGroup (necessario per KTX2)

Se non hai connessione internet al momento del setup, i file libktx possono essere scaricati manualmente — vedi sezione *File WASM* più sotto.

## Struttura del progetto

```
src/
├── workers/
│   └── optimizer.worker.ts   # pipeline completa (gltf-transform + KTX2)
├── lib/
│   ├── ktx2Encoder.ts        # wrapper libktx.wasm (KhronosGroup)
│   ├── geometryOps.ts        # weld / dedup / prune / draco
│   └── metricsExtractor.ts   # conteggio vertici, triangoli, texture
├── components/
│   ├── DropZone.tsx
│   ├── ViewerPanel.tsx        # viewer Babylon.js singolo
│   ├── DualViewer.tsx         # before + after con camere sincronizzate
│   ├── MetricsTable.tsx
│   └── OptimizeControls.tsx
├── hooks/
│   └── useOptimizer.ts        # bridge React ↔ Worker
└── types/
    └── pipeline.ts
public/
└── wasm/
    ├── basis_transcoder.js/.wasm  # KTX2 decoding per Babylon.js
    ├── draco_encoder/.decoder.wasm
    ├── libktx.js                  # KTX2 encoding (encoder KHronosGroup)
    └── libktx.wasm
scripts/
└── setup-wasm.mjs              # script di setup WASM automatico
```

## File WASM

| File | Sorgente | Come si ottiene |
|------|----------|-----------------|
| `basis_transcoder.js/.wasm` | `@babylonjs/core` | Automatico via `setup:wasm` |
| `draco_encoder/.decoder.wasm` | `draco3d` npm | Automatico via `setup:wasm` |
| `libktx.js/.wasm` | KhronosGroup KTX-Software v4.4.2 | **Automatico** via `setup:wasm` (download da GitHub) |

### Download manuale di libktx (se setup:wasm fallisce)

```bash
# Scarica da:
# https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2
# File: KTX-Software-4.4.2-Web-libktx.zip (~700 KB)
# Estrai libktx.js e libktx.wasm in public/wasm/
```

## Pipeline di ottimizzazione

```
GLB input
  │
  ├─ weld        – fonde vertici coincidenti
  ├─ dedup       – elimina accessor/texture duplicati
  ├─ prune       – rimuove nodi e materiali inutilizzati
  ├─ draco       – compressione geometria (opzionale)
  │
  └─ KTX2 (libktx.wasm)
       ├─ ETC1S  – massima compressione, qualità GPU ottima
       └─ UASTC  – massima qualità, lossless-ish
```

Tutto eseguito in un **Web Worker** separato. La UI resta reattiva durante l'elaborazione.

## Decisioni tecniche

### Perché 100% client-side?
I modelli 3D spesso contengono IP aziendale o asset protetti. Elaborarli nel browser garantisce privacy totale: nessun dato viene trasmesso a server esterni.

### Perché `libktx.wasm` (KhronosGroup) invece di `basis_encoder.wasm` (BinomialLLC)?
Entrambe le librerie implementano Basis Universal (ETC1S e UASTC) e producono file KTX2 identici. La scelta è caduta su `libktx` perché:
- **Build pre-compilate disponibili**: KhronosGroup pubblica WASM pre-built ad ogni release su GitHub (`Web-libktx.zip`), quindi non è necessario Emscripten
- **Manutenzione attiva**: KTX-Software è il progetto ufficiale di KhronosGroup per KTX2
- **API stabile**: la libreria espone un'interfaccia C++ via Embind, documentata e testata

`basis_encoder.wasm` di BinomialLLC non ha build pre-compilati nelle release GitHub e richiede la toolchain Emscripten per essere prodotto.

### Perché un Web Worker?
L'encoding KTX2 di una texture 2K con ETC1S impiega 2–10 secondi. Eseguirlo sul thread principale congela l'interfaccia. Il Worker gira in parallelo; la UI riceve messaggi di progresso ogni step.

### Perché Babylon.js e non Three.js?
Il brief richiedeva Babylon.js. Babylon ha supporto nativo KTX2 tramite `KhronosTextureContainer2` e permette di sincronizzare facilmente due camere `ArcRotateCamera` via `onViewMatrixChangedObservable`.

## Licenza

MIT — vedi [LICENSE](LICENSE)
