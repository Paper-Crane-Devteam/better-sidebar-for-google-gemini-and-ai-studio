// [DEPRECATED] Watermark removal - Gemini no longer adds watermarks to downloads
// import { WatermarkEngine } from '@/shared/lib/utils/watermark-remover';
// import { usePegasusStore } from '@/shared/lib/pegasus-store';

// let watermarkEngineInstance: WatermarkEngine | null = null;

export async function handleDownloadResponse(
  url: string,
  originalFetch: typeof window.fetch,
): Promise<Response> {
  const upscaledUrl = url.replace(/=s\d+/, '=s0');
  console.log('Better Sidebar (Gemini): Intercepted image download', url, '->', upscaledUrl);

  // [DEPRECATED] Watermark removal disabled - Gemini no longer adds watermarks
  // const shouldRemoveWatermark = usePegasusStore.getState().enhancedFeatures.gemini.removeWatermark;

  try {
    const res = await originalFetch(upscaledUrl);
    const blob = await res.blob();

    const finalBlob = blob;

    // [DEPRECATED] Watermark removal logic - Gemini no longer adds watermarks
    // if (shouldRemoveWatermark) {
    //   try {
    //     if (!watermarkEngineInstance) {
    //       watermarkEngineInstance = await WatermarkEngine.create();
    //     }
    //     const blobUrl = URL.createObjectURL(blob);
    //     finalBlob = await watermarkEngineInstance.process(blobUrl);
    //     URL.revokeObjectURL(blobUrl);
    //   } catch (e) {
    //     console.error('Better Sidebar (Gemini): Watermark removal failed, using original', e);
    //   }
    // }

    // Return the processed blob as the fetch response so the browser's
    // native download handler receives the modified image instead of
    // triggering a second download.
    return new Response(finalBlob, {
      status: res.status,
      headers: { 'Content-Type': finalBlob.type || 'image/png' },
    });
  } catch (e) {
    console.error('Better Sidebar (Gemini): Error processing image download', e);
    // Fall through to the original fetch on error
    return originalFetch(url);
  }
}
