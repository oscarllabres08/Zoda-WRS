import { money } from '../lib/format';

export type ReceiptLine = {
  name: string;
  quantity: number;
  unitPrice: number;
};

export type DigitalReceiptProps = {
  businessName: string;
  customerName?: string | null;
  receiptNo: string;
  soldAt: Date;
  lines: ReceiptLine[];
  total: number;
  cashReceived?: number | null;
  changeDue?: number | null;
  footerNote?: string;
};

export function DigitalReceipt({
  businessName,
  customerName,
  receiptNo,
  soldAt,
  lines,
  total,
  cashReceived,
  changeDue,
  footerNote = 'Thank you for your business!',
}: DigitalReceiptProps) {
  const customer = (customerName ?? '').trim() || 'Walk-in customer';

  return (
    <div className="digital-receipt">
      <div className="digital-receipt-brand">{businessName}</div>
      <div className="digital-receipt-meta">Laundry · Digital receipt</div>
      <div className="digital-receipt-divider" />
      <div className="digital-receipt-row digital-receipt-customer">
        <span>Customer</span>
        <strong>{customer}</strong>
      </div>
      <div className="digital-receipt-row">
        <span>Receipt #</span>
        <strong>{receiptNo}</strong>
      </div>
      <div className="digital-receipt-row">
        <span>Date</span>
        <span>{soldAt.toLocaleString()}</span>
      </div>
      <div className="digital-receipt-divider" />
      <table className="digital-receipt-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.name}-${i}`}>
              <td>{l.name}</td>
              <td>{l.quantity}</td>
              <td>{money(l.unitPrice * l.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="digital-receipt-divider" />
      <div className="digital-receipt-row digital-receipt-total">
        <span>Total</span>
        <strong>{money(total)}</strong>
      </div>
      {cashReceived != null && cashReceived > 0 ? (
        <>
          <div className="digital-receipt-row">
            <span>Cash received</span>
            <span>{money(cashReceived)}</span>
          </div>
          <div className="digital-receipt-row">
            <span>Change</span>
            <span>{money(changeDue ?? 0)}</span>
          </div>
        </>
      ) : null}
      <div className="digital-receipt-divider" />
      <p className="digital-receipt-thanks">{footerNote}</p>
    </div>
  );
}

export function printReceiptElement(rootId: string) {
  const el = document.getElementById(rootId);
  if (!el) return;
  const html = el.innerHTML;
  const w = window.open('', '_blank', 'width=400,height=640');
  if (!w) return;
  w.document.write(`
    <!DOCTYPE html><html><head><title>Receipt</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 16px; max-width: 320px; margin: 0 auto; color: #0a1b37; }
      .digital-receipt-brand { font-weight: 800; font-size: 18px; text-align: center; }
      .digital-receipt-meta { text-align: center; font-size: 12px; color: #6a7a95; margin-top: 4px; }
      .digital-receipt-divider { border-top: 1px dashed #ccc; margin: 12px 0; }
      .digital-receipt-row { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; margin: 4px 0; }
      .digital-receipt-customer strong { text-align: right; max-width: 58%; }
      .digital-receipt-total { font-size: 16px; margin-top: 8px; }
      table { width: 100%; font-size: 12px; border-collapse: collapse; }
      th, td { text-align: left; padding: 4px 0; }
      th:last-child, td:last-child { text-align: right; }
      .digital-receipt-thanks { text-align: center; font-size: 12px; color: #6a7a95; }
    </style></head><body>${html}</body></html>
  `);
  w.document.close();
  w.focus();
  w.print();
  w.close();
}
