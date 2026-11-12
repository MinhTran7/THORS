import { useEffect, useRef } from 'react';

/**
 * USB / Bluetooth barcode scanners act as a keyboard: they "type" the code very fast and press Enter.
 * This hook listens on the whole page and tells such a burst apart from a person typing by the gap
 * between keys, so the owner can scan without first clicking into a field.
 *
 * Keys typed inside an editable field are left alone: that field receives the code itself (e.g. the
 * code box in the scan dialog submits on Enter), so nothing is handled twice.
 */
const MAX_GAP_MS = 60; // scanners send a key every ~5–30 ms; people rarely type under 60 ms per key
const MIN_LENGTH = 4;

const isEditable = (el) =>
  !!el &&
  (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(el.type)));

export default function useBarcodeScanner(onScan, enabled = true) {
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return undefined;
    let buffer = '';
    let last = 0;
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey || isEditable(event.target)) {
        buffer = '';
        return;
      }
      const now = event.timeStamp || performance.now();
      const gap = now - last;
      last = now;
      if (event.key === 'Enter' || event.key === 'Tab') {
        const code = buffer;
        buffer = '';
        if (code.length >= MIN_LENGTH && gap <= MAX_GAP_MS * 2) {
          event.preventDefault();
          event.stopPropagation();
          handler.current(code);
        }
        return;
      }
      if (event.key.length !== 1) return; // Shift, CapsLock… are part of the burst, not characters
      buffer = gap <= MAX_GAP_MS ? buffer + event.key : event.key;
      if (buffer.length > 64) buffer = '';
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
