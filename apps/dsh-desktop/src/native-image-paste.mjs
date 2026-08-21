const MAX_CLIPBOARD_IMAGE_BYTES = 20 * 1024 * 1024

export function buildNativeImagePasteScript(png) {
  if (!Buffer.isBuffer(png) || png.length === 0 || png.length > MAX_CLIPBOARD_IMAGE_BYTES) return undefined
  const base64 = JSON.stringify(png.toString('base64'))
  return `(() => {
    const binary = atob(${base64});
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'pasted-image.png', { type: 'image/png' }));
    const target = document.activeElement || document.body;
    return target.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
  })()`
}
