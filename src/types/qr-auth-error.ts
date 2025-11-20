/**
 * Error thrown when WhatsApp QR code authentication is required.
 * This is not a fatal error - it indicates that the user needs to scan a QR code.
 * The QR code value is included in the error for logging purposes.
 */
export class QRAuthenticationRequiredError extends Error {
  public readonly qrCode: string;

  constructor(qrCode: string, message: string = 'WhatsApp QR code authentication required.') {
    super(message);
    this.name = 'QRAuthenticationRequiredError';
    this.qrCode = qrCode;
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, QRAuthenticationRequiredError);
    }
  }
}

