# LightLoad — GLB Optimizer

**Optimize 3D assets directly in the browser. No uploads, no servers, no data leaves your device.**

LightLoad compresses `.glb` files using Draco geometry compression and KTX2/Basis Universal texture encoding, with a side-by-side Babylon.js viewer to compare results before downloading.

**[→ Live Demo](https://www.lightload.it)**

---

## Features

- **Optimization profiles** — one-click presets (_E-commerce_ · max compression, _AR / Meta_ · high quality) with a collapsible **Advanced Settings** panel for full manual control
- **Geometry compression** — Weld, Dedup, Prune, Simplify (meshoptimizer), plus mutually-exclusive **Draco** or **Meshopt** (`EXT_meshopt_compression`) mesh compression
- **Texture compression** — ETC1S (max compression) or UASTC (max quality) via Basis Universal / libktx
- **Side-by-side 3D viewer** — Babylon.js with synchronized cameras, a **wireframe toggle** to inspect decimated geometry, and a **focus mode** to expand the canvases
- **Before / after metrics** — file size, vertex/triangle count, texture inventory and **estimated VRAM** footprint (geometry + textures)
- **Multilingual UI** — i18n via `i18next` (English + Italian) with browser-language autodetection and a header switcher; worker progress messages are localized too
- **100% client-side** — all processing runs in a Web Worker; no file ever leaves the browser

---

## Getting started

```bash
npm install
npm run setup:wasm   # downloads and copies all required WASM binaries
npm run dev
```

Open `http://localhost:5173`, drop a `.glb` file and hit **Optimize**.

> **`setup:wasm`** does the following automatically:
> - Copies Babylon.js KTX2 transcoder and Draco encoder/decoder from `node_modules`
> - Downloads `libktx.js` + `libktx.wasm` from the KhronosGroup GitHub release (KTX2 encoder)
> - Downloads `msc_basis_transcoder.js` + `.wasm` from KhronosGroup (KTX2 viewer support)
> - Downloads `babylon.ktx2Decoder.js` from the Babylon.js CDN

---

## Stack

| Layer | Technology |
|---|---|
| UI | React 19 + Vite + TypeScript |
| 3D Viewer | Babylon.js v9 (`KhronosTextureContainer2`, `ArcRotateCamera`) |
| GLB parsing | `@gltf-transform/core` v4 + `@gltf-transform/functions` |
| Geometry compression | `draco3d` (encoder/decoder WASM) + `meshoptimizer` (simplify + `EXT_meshopt_compression`) |
| Texture encoding | `libktx.wasm` — KhronosGroup KTX-Software v4.4.2 |
| Texture decoding | `msc_basis_transcoder.wasm` (Khronos) + `babylon.ktx2Decoder.js` |
| Threading | Web Worker (`optimizer.worker.ts`) with transferable ArrayBuffers |
| Localization | `i18next` + `react-i18next` (shared locales, main thread & worker) |

---

## Project structure

```
src/
├── workers/
│   └── optimizer.worker.ts     # full pipeline: geometry ops + KTX2 encoding
├── lib/
│   ├── ktx2Encoder.ts          # libktx WASM wrapper (Embind bindings)
│   ├── geometryOps.ts          # weld / dedup / prune / draco / meshopt / simplify
│   ├── metricsExtractor.ts     # vertex, triangle and texture counters
│   ├── vram.ts                 # estimated VRAM footprint
│   └── profiles.ts             # optimization presets (e-commerce / AR)
├── components/
│   ├── ViewerPanel.tsx         # Babylon.js canvas + wireframe (prop-based, no forwardRef)
│   ├── MetricsTable.tsx
│   ├── VramBadge.tsx
│   ├── OptimizeControls.tsx    # advanced geometry / texture toggles
│   ├── ProfileSelector.tsx     # profile presets (progressive disclosure)
│   └── LanguageSwitcher.tsx
├── hooks/
│   └── useOptimizer.ts         # React ↔ Worker message bridge
├── i18n/
│   ├── index.ts                # react-i18next setup (main thread)
│   ├── worker.ts               # standalone i18next instance for the Web Worker
│   ├── resources.ts            # shared locale resources
│   └── locales/                # en.json · it.json
└── types/
    └── pipeline.ts             # shared types for worker messages and options

public/wasm/
├── babylon.ktx2Decoder.js      # KTX2 decoder worker (Babylon.js CDN)
├── msc_basis_transcoder.js/.wasm   # Khronos MSC transcoder (KTX2 viewer)
├── libktx.js/.wasm             # KhronosGroup libktx encoder (KTX2 writer)
├── draco_encoder.js/.wasm      # Draco geometry encoder
├── draco_decoder.js/.wasm      # Draco geometry decoder
└── basis_transcoder.js/.wasm   # Babylon.js basis transcoder (legacy)
```

---

## Optimization pipeline

```
GLB input
  │
  ├── weld        merge coincident vertices
  ├── dedup       remove duplicate accessors and textures
  ├── prune       strip unused nodes, materials and extensions
  ├── simplify    reduce polygon count (meshoptimizer)
  │
  ├── draco       compress mesh geometry (Google Draco)            ┐ mutually
  ├── meshopt     compress mesh geometry (EXT_meshopt_compression) ┘ exclusive
  │
  └── KTX2  (libktx.wasm · runs in Web Worker)
        ├── ETC1S   — highest compression, GPU-native quality
        └── UASTC   — highest fidelity, supercompressed with Zstandard
```

Profiles map directly onto this pipeline: _E-commerce_ favours Draco + ETC1S with aggressive simplification, _AR / Meta_ favours Meshopt + UASTC with light simplification, and _Custom_ exposes every toggle.

The entire pipeline runs inside a **Web Worker** so the UI remains fully responsive. Progress is streamed back to the main thread on each step — localized via a standalone `i18next` instance that receives the active language with the optimization request.

---

## WASM binaries

All binaries are fetched/copied automatically by `npm run setup:wasm`. Manual fallbacks are listed below.

| File | Source | Auto |
|---|---|:---:|
| `babylon.ktx2Decoder.js` | [cdn.babylonjs.com](https://cdn.babylonjs.com/babylon.ktx2Decoder.js) | ✓ |
| `msc_basis_transcoder.{js,wasm}` | [KhronosGroup/KTX-Software v4.4.2](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2) — `Web-msc_basis_transcoder.zip` | ✓ |
| `libktx.{js,wasm}` | [KhronosGroup/KTX-Software v4.4.2](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2) — `Web-libktx.zip` | ✓ |
| `draco_encoder.{js,wasm}` | `draco3d` npm package | ✓ |
| `draco_decoder.{js,wasm}` | `draco3d` npm package | ✓ |
| `basis_transcoder.{js,wasm}` | `@babylonjs/core` npm package | ✓ |

---

## Technical decisions

### Why 100% client-side?
3D assets frequently contain proprietary geometry, textures, or IP. Running the entire pipeline inside the browser — with no server round-trip — guarantees that files never leave the user's machine.

### Why `libktx.wasm` instead of `basis_encoder.wasm`?
Both libraries implement Basis Universal and produce spec-compliant KTX2 files. `libktx` was chosen because KhronosGroup publishes pre-built WebAssembly binaries on every GitHub release (`Web-libktx.zip`), whereas BinomialLLC's `basis_encoder.wasm` has no official pre-built distribution and requires the Emscripten toolchain to compile from source.

### Why a Web Worker?
ETC1S encoding of a single 2K texture can take 2–10 seconds of CPU time. Running that on the main thread would freeze the interface. The Worker runs the entire pipeline in a separate thread and posts progress events back; the UI stays interactive throughout.

### Why Babylon.js?
Babylon.js ships with first-class KTX2 support via `KhronosTextureContainer2` and makes camera synchronization straightforward via `onViewMatrixChangedObservable` — both are required features for the before/after viewer.

### Why ESM Web Workers and `fetch` + `new Function` for WASM?
Vite compiles workers as ES modules (`format: 'es'`), which means `importScripts` is unavailable. The Draco and libktx CJS modules are loaded at runtime via `fetch` + `new Function` to evaluate them in the worker context without bundler interference. This lets us keep Vite's tree-shaking for the main thread while still using CJS WASM loaders in the worker.

---

## License

MIT — see [LICENSE](LICENSE)
