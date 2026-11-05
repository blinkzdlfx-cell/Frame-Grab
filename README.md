# FrameGrab

A privacy-focused, browser-based video frame extractor. Select a video, choose an interval or target frame count, and export the captured images individually or as a ZIP. Video decoding and frame extraction happen locally in the browser; the application does not upload video files to a server.

## Features

- Local video preview and metadata detection
- Time-interval and target-count extraction modes
- Additional exact timestamps (in seconds)
- Optional best-effort blur filtering
- JPEG/PNG export with adjustable JPEG quality
- Sequential frame processing with progress and cancellation
- Selectable frame gallery, full-size preview, individual downloads, and ZIP export
- Responsive layout for mobile and desktop

## Development

Requirements: Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

## Verify and build

```bash
npm run typecheck
npm run build
npm run preview
```

## Deploy to Cloudflare Workers

The Worker serves the static Vite build from `dist/`. It does not process videos or store user files.

```bash
npx wrangler login
npm run deploy
```

The first deployment may ask you to create or select the Cloudflare account.

## Browser support notes

Actual video decoding depends on the codecs supported by the user's browser and device. MP4 with H.264 video is the safest general recommendation. MOV/HEVC and AVI support varies. The app intentionally does not claim that every container/codec combination is supported.

## Privacy

Video files are read with the browser File API and decoded by the local HTML video element. Extracted images and ZIP archives are generated in browser memory. No API, database, account, or server-side media processing is used.