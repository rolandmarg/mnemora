import qrcode from 'qrcode-terminal';

/**
 * Display QR code in terminal using qrcode-terminal.
 * Always uses compact mode (small: true) for consistent display.
 * 
 * @param qrCode - The QR code string to display
 */
export function displayQRCode(qrCode: string): void {
  qrcode.generate(qrCode, { small: true });
}

