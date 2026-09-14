// pdfjs-dist 6.x only ships a declaration file next to the *legacy* build
// (`legacy/build/pdf.d.mts`, whose whole content is `export * from "pdfjs-dist"`).
// The modern build we actually import has no sibling `.d.mts`, so TS would fall
// over with TS7016. Mirror what the legacy path does.
//
// We must import the modern build: the legacy one inlines core-js polyfills that
// the Chrome Web Store review flags as obfuscated code (2.10.0 rejection,
// violation ref "Red Titanium"). See src/shared/documents/pdf/read.ts.
declare module 'pdfjs-dist/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}
