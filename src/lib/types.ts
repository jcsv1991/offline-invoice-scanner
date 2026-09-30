export interface LineItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceData {
  vendor: string;
  invoiceNumber: string;
  /** ISO date (YYYY-MM-DD) or empty string when unknown. */
  invoiceDate: string;
  items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
}

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface DeliveryNote {
  id: string;
  noteNumber: string;
  /** ISO timestamp of when the note was generated on the device. */
  createdAt: string;
  receivedBy: string;
  location: string;
  remarks: string;
  invoice: InvoiceData;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
  syncedAt?: string;
  /** Small JPEG data-URL of the scanned paper, kept for reference in the notes list. */
  thumbnail?: string;
}

/** What is sent to the server. Deliberately excludes local-only fields (status, thumbnail...). */
export interface SyncPayload {
  source: 'offline-invoice-scanner';
  version: 1;
  id: string;
  noteNumber: string;
  createdAt: string;
  receivedBy: string;
  location: string;
  remarks: string;
  invoice: InvoiceData;
}

export interface Settings {
  receivedBy: string;
  location: string;
  currency: 'CAD' | 'USD' | 'EUR' | 'GBP';
  syncMode: 'demo' | 'webhook';
  webhookUrl: string;
  /** Demo-only: pretend the network is down so the queue can be shown without airplane mode. */
  simulateOffline: boolean;
}
