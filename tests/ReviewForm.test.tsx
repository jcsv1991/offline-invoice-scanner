import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReviewForm } from '../src/components/ReviewForm';
import type { InvoiceData } from '../src/lib/types';

const base = (over: Partial<InvoiceData> = {}): InvoiceData => ({
  vendor: 'Harvest Lane',
  invoiceNumber: 'HL-1',
  invoiceDate: '2026-09-24',
  items: [{ id: 'i1', description: 'Flour', qty: 6, unitPrice: 28.5, amount: 171 }],
  subtotal: 171,
  tax: 8.55,
  total: 179.55,
  ...over,
});

const renderForm = (initial: InvoiceData, extra: Partial<Parameters<typeof ReviewForm>[0]> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ReviewForm initial={initial} dateAmbiguous={false} defaults={{ receivedBy: 'Alex', location: 'Downtown' }} currency="CAD" onConfirm={onConfirm} onCancel={onCancel} {...extra} />,
  );
  return { onConfirm, onCancel };
};

describe('ReviewForm', () => {
  it('pre-fills from OCR and the remembered defaults', () => {
    renderForm(base());
    expect(screen.getByLabelText('Vendor')).toHaveValue('Harvest Lane');
    expect(screen.getByLabelText('Invoice #')).toHaveValue('HL-1');
    expect(screen.getByLabelText('Received by')).toHaveValue('Alex');
    expect(screen.getByLabelText('Location')).toHaveValue('Downtown');
  });

  it('cannot generate a note without a vendor or items, and says why', async () => {
    renderForm(base({ vendor: '', items: [] }));
    expect(screen.getByTestId('generate-note')).toBeDisabled();
    expect(screen.getByText(/add a vendor and at least one item/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Vendor'), 'Acme');
    expect(screen.getByTestId('generate-note')).toBeDisabled(); // still no items
    await userEvent.click(screen.getByTestId('add-item'));
    expect(screen.getByTestId('generate-note')).toBeEnabled();
  });

  it('recomputes a line amount when qty or unit price is edited', async () => {
    renderForm(base());
    const qty = screen.getByLabelText('Item 1 quantity');
    await userEvent.clear(qty);
    await userEvent.type(qty, '10');
    expect(screen.getByLabelText('Item 1 amount')).toHaveValue(285);
  });

  it('warns when the items do not add up to the subtotal and fixes it in one tap', async () => {
    renderForm(base({ subtotal: 200, total: 208.55 }));
    const issues = screen.getByTestId('math-issues');
    expect(within(issues).getByText(/line items add up to 171\.00/i)).toBeInTheDocument();
    await userEvent.click(within(issues).getByRole('button', { name: /set subtotal to 171\.00/i }));
    expect(screen.getByLabelText('Subtotal')).toHaveValue(171);
    expect(screen.queryByText(/line items add up to/i)).not.toBeInTheDocument();
  });

  it('lets the user type decimals naturally (no snapping while typing)', async () => {
    renderForm(base());
    const unit = screen.getByLabelText('Item 1 unit price');
    await userEvent.clear(unit);
    await userEvent.type(unit, '12.5');
    expect(unit).toHaveValue(12.5);
    expect(screen.getByLabelText('Item 1 amount')).toHaveValue(75);
  });

  it('hands the edited values to onConfirm', async () => {
    const { onConfirm } = renderForm(base());
    await userEvent.type(screen.getByLabelText(/remarks/i), 'One bag torn');
    await userEvent.click(screen.getByTestId('generate-note'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const v = onConfirm.mock.calls[0][0];
    expect(v.remarks).toBe('One bag torn');
    expect(v.receivedBy).toBe('Alex');
    expect(v.invoice.vendor).toBe('Harvest Lane');
  });

  it('flags a low-confidence scan and an ambiguous date', () => {
    renderForm(base(), { ocrConfidence: 52, dateAmbiguous: true });
    expect(screen.getByText(/hard to read \(confidence 52%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/day\/month order was guessed/i)).toBeInTheDocument();
  });

  it('lets you remove an item', async () => {
    renderForm(base());
    await userEvent.click(screen.getByRole('button', { name: /remove item 1/i }));
    expect(screen.queryAllByTestId('item-row')).toHaveLength(0);
  });
});
