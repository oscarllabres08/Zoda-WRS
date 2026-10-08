import { useCallback, useEffect, useMemo, useRef, useState } from 'react';



import { CategoryBarChart, SalesBarChart, SalesDonutChart } from '../components/SalesCharts';

import { useAuth } from '../auth/AuthProvider';

import {
  downloadDaySpreadsheet,
  downloadMonthSpreadsheet,
  downloadYearSpreadsheet,
} from '../lib/exportSalesSpreadsheet';

import { money } from '../lib/format';

import {

  fetchDayExportPayload,

  fetchMonthExportPayload,

  fetchYearExportPayload,

  loadSalesAnalyticsView,

  formatPctChangeLabel,

  RECENT_SALES_PAGE,

  type RecentSaleRow,

  type SalesDashboardData,

  type SalesDisplayMode,

} from '../lib/salesReportData';



type DisplayGranularity = 'day' | 'month' | 'year';

const DISPLAY_GRANULARITY: { id: DisplayGranularity; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];



function toDateInputValue(d: Date): string {

  const y = d.getFullYear();

  const m = String(d.getMonth() + 1).padStart(2, '0');

  const day = String(d.getDate()).padStart(2, '0');

  return `${y}-${m}-${day}`;

}



function parseDateInput(value: string): { year: number; month: number; day: number } {

  const [y, m, d] = value.split('-').map(Number);

  return { year: y, month: m - 1, day: d };

}



export function SalesAnalyticsPage() {

  const { businessId } = useAuth();

  const [displayGranularity, setDisplayGranularity] = useState<DisplayGranularity>('month');

  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));

  const [data, setData] = useState<SalesDashboardData | null>(null);

  const [loading, setLoading] = useState(true);

  const [exporting, setExporting] = useState(false);

  const [exportError, setExportError] = useState<string | null>(null);

  const [selectedSale, setSelectedSale] = useState<RecentSaleRow | null>(null);

  const [recentVisible, setRecentVisible] = useState(RECENT_SALES_PAGE);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const openDatePicker = useCallback(() => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        /* fallback below */
      }
    }
    input.focus();
    input.click();
  }, []);

  const { year: filterYear, month: filterMonth, day: filterDay } = useMemo(

    () => parseDateInput(selectedDate),

    [selectedDate]

  );



  const analyticsMode: SalesDisplayMode =
    displayGranularity === 'day' ? 'today' : displayGranularity === 'month' ? 'day' : 'month';



  const load = useCallback(async () => {

    if (!businessId) return;

    setLoading(true);

    try {

      const dash = await loadSalesAnalyticsView(businessId, analyticsMode, filterYear, filterMonth, filterDay);

      setData(dash);
      setRecentVisible(RECENT_SALES_PAGE);

    } finally {

      setLoading(false);

    }

  }, [businessId, analyticsMode, filterYear, filterMonth, filterDay]);



  useEffect(() => {

    void load();

  }, [load]);

  const filterLabel = useMemo(() => {

    if (displayGranularity === 'day') {
      return new Date(filterYear, filterMonth, filterDay).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }

    if (displayGranularity === 'month') {

      return new Date(filterYear, filterMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    }

    return String(filterYear);

  }, [displayGranularity, filterYear, filterMonth, filterDay]);

  const pickerLabel = useMemo(() => {
    if (displayGranularity === 'day') {
      return new Date(filterYear, filterMonth, filterDay).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    if (displayGranularity === 'month') {
      return new Date(filterYear, filterMonth, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    return String(filterYear);
  }, [displayGranularity, filterYear, filterMonth, filterDay]);

  const chartSlotWidth = displayGranularity === 'year' ? 52 : 44;



  const salesChangeLabel = data ? formatPctChangeLabel(data.totalSales, data.prevTotalSales) : null;

  const ordersChangeLabel = data ? formatPctChangeLabel(data.totalOrderCount, data.prevTotalOrders) : null;



  const onlineShare = data && data.totalSales > 0 ? (data.onlineSales / data.totalSales) * 100 : 0;

  const walkShare = data && data.totalSales > 0 ? (data.walkInSales / data.totalSales) * 100 : 0;

  const paidShare = data && data.totalOrderCount > 0 ? (data.paidOrders / data.totalOrderCount) * 100 : 0;

  const unpaidShare = data && data.totalOrderCount > 0 ? (data.unpaidOrders / data.totalOrderCount) * 100 : 0;



  async function handleExport() {
    if (!businessId) return;
    setExporting(true);
    setExportError(null);
    try {
      if (displayGranularity === 'day') {
        const payload = await fetchDayExportPayload(businessId, filterYear, filterMonth, filterDay);
        await downloadDaySpreadsheet(payload, `zoda-wrs-sales-${selectedDate}.xlsx`);
      } else if (displayGranularity === 'month') {
        const payload = await fetchMonthExportPayload(businessId, filterYear, filterMonth);
        const name = `zoda-wrs-sales-${filterYear}-${String(filterMonth + 1).padStart(2, '0')}.xlsx`;
        await downloadMonthSpreadsheet(payload, name);
      } else {
        const payload = await fetchYearExportPayload(businessId, filterYear);
        await downloadYearSpreadsheet(payload, `zoda-wrs-sales-${filterYear}.xlsx`);
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed. Check your internet connection and try again.');
    } finally {
      setExporting(false);
    }
  }



  return (

    <div className="sales-analytics-layout">

      {exportError ? <p className="error-text module-alert">{exportError}</p> : null}

      <div className="sales-toolbar card card-flat">
        <div className="sales-toolbar-block">
          <span className="sales-toolbar-heading">Display sales</span>
          <div className="sales-toolbar-controls">
            <div className="sales-period-tabs" role="tablist" aria-label="Sales display period">
              {DISPLAY_GRANULARITY.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={displayGranularity === p.id}
                  className={`pos-category-tab${displayGranularity === p.id ? ' active' : ''}`}
                  onClick={() => setDisplayGranularity(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label
              className="sales-date-picker-btn sales-date-picker-btn--inline"
              title={pickerLabel}
              htmlFor="sales-display-date"
              onClick={() => openDatePicker()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openDatePicker();
                }
              }}
            >
              <span className="sales-date-picker-icon" aria-hidden>
                📅
              </span>
              <strong className="sales-date-picker-value">{pickerLabel}</strong>
              <input
                id="sales-display-date"
                ref={dateInputRef}
                type="date"
                className="sales-date-input-overlay"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                aria-label="Select date to display sales"
              />
            </label>
            <button
              type="button"
              className="btn btn-primary btn-sm sales-export-action"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
          </div>
          <p className="sales-filter-summary">
            Showing <strong>{filterLabel}</strong>
            {' · '}
            Export downloads the same sales shown above
          </p>
        </div>
      </div>



      {loading ? <p className="muted-block">Loading sales data…</p> : null}



      {data ? (

        <>

          <div className="sales-kpi-grid">

            <KpiCard label="Total Sales" value={money(data.totalSales)} changeLabel={salesChangeLabel} />

            <KpiCard label="Total Orders" value={String(data.totalOrderCount)} changeLabel={ordersChangeLabel} />

            <KpiCard label="Online Sales" value={money(data.onlineSales)} sub={`${onlineShare.toFixed(1)}% of total sales`} />

            <KpiCard label="Walk-in Sales" value={money(data.walkInSales)} sub={`${walkShare.toFixed(1)}% of total sales`} />

            <KpiCard label="Paid Orders" value={String(data.paidOrders)} sub={`${paidShare.toFixed(1)}% of orders`} />

            <KpiCard label="Unpaid Orders" value={String(data.unpaidOrders)} sub={`${unpaidShare.toFixed(1)}% of orders`} />

          </div>



          <div className="sales-charts-grid">

            <div className="card card-flat sales-chart-card">

              <h2 className="inventory-section-title">Sales Overview</h2>

              <p className="sales-chart-period-hint">

                {filterLabel}

                {displayGranularity === 'day'

                  ? ' · Last 7 days'

                  : displayGranularity === 'month'

                    ? ` · ${data.timeline.length} days`

                    : ' · 12 months'}

              </p>

              <div className="sales-chart-legend">

                <span><i className="lg total" /> Total (bar height)</span>

                <span><i className="lg online" /> Online</span>

                <span><i className="lg walk" /> Walk-in</span>

              </div>

              <SalesBarChart points={data.timeline} slotWidth={chartSlotWidth} />

            </div>

            <div className="card card-flat sales-chart-card sales-chart-card--donut">

              <h2 className="inventory-section-title">Sales Breakdown</h2>

              <SalesDonutChart online={data.onlineSales} walkIn={data.walkInSales} total={data.totalSales} />

            </div>

          </div>



          <div className="card card-flat" style={{ marginBottom: 16 }}>

            <h2 className="inventory-section-title">Sales by Product Category</h2>

            <CategoryBarChart totals={data.categoryTotals} />

          </div>



          <div className="sales-lower-grid sales-lower-grid--recent-only">

            <div className="card card-flat">

              <h2 className="inventory-section-title">Recent Sales</h2>

              {data.recentSales.length > 0 ? (
                <p className="sales-table-hint">Tap a row to view customer details · swipe sideways for all columns</p>
              ) : null}

              <div className="table-wrap sales-table-scroll">

                <table className="data-table sales-recent-table">

                  <thead>

                    <tr>

                      <th className="sales-col-customer">Customer</th>

                      <th className="sales-col-datetime">Date &amp; Time</th>

                      <th className="sales-col-product">Product</th>

                      <th className="sales-col-type">Type</th>

                      <th className="sales-col-payment">Payment</th>

                      <th className="sales-col-amount">Amount</th>

                      <th className="sales-col-status">Status</th>

                    </tr>

                  </thead>

                  <tbody>

                    {data.recentSales.length === 0 ? (

                      <tr>

                        <td colSpan={7} className="muted-block">

                          No transactions yet.

                        </td>

                      </tr>

                    ) : (

                      data.recentSales.slice(0, recentVisible).map((r) => (

                        <tr
                          key={r.id}
                          className="sales-row-clickable"
                          tabIndex={0}
                          role="button"
                          onClick={() => setSelectedSale(r)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedSale(r);
                            }
                          }}
                        >

                          <td className="sales-col-customer">{r.customerName}</td>

                          <td className="sales-col-datetime">

                            {r.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},{' '}

                            {r.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}

                          </td>

                          <td className="sales-col-product">{r.productLabel}</td>

                          <td className="sales-col-type">

                            <span className={`sales-pill ${r.type === 'online' ? 'online' : 'walk'}`}>

                              {r.type === 'online' ? 'Online' : 'Walk-in'}

                            </span>

                          </td>

                          <td className="sales-col-payment">

                            <span className={`sales-pill ${r.paymentMethod === 'GCash' ? 'gcash' : r.paymentMethod === 'Cash' ? 'cash' : 'neutral'}`}>

                              {r.paymentMethod}

                            </span>

                          </td>

                          <td className="sales-col-amount">{money(r.amount)}</td>

                          <td className="sales-col-status">

                            <span className={`sales-pill ${r.status}`}>{r.status === 'paid' ? 'Paid' : 'Unpaid'}</span>

                          </td>

                        </tr>

                      ))

                    )}

                  </tbody>

                </table>

              </div>

              {data.recentSales.length > recentVisible ? (
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setRecentVisible((v) => v + RECENT_SALES_PAGE)}
                  >
                    Show more
                  </button>
                </div>
              ) : null}

            </div>

          </div>

        </>

      ) : null}

      {selectedSale ? (
        <div className="modal-backdrop" onClick={() => setSelectedSale(null)} role="presentation">
          <div className="modal-card sales-sale-detail-modal" role="dialog" aria-labelledby="sales-sale-detail-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="sales-sale-detail-title" style={{ margin: '0 0 12px', fontSize: 18 }}>
              Sale details
            </h2>
            <dl className="sales-sale-detail-list">
              <div>
                <dt>Customer</dt>
                <dd>{selectedSale.customerName}</dd>
              </div>
              <div>
                <dt>Date &amp; time</dt>
                <dd>
                  {selectedSale.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })},{' '}
                  {selectedSale.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>
                  <span className={`sales-pill ${selectedSale.type === 'online' ? 'online' : 'walk'}`}>
                    {selectedSale.type === 'online' ? 'Online' : 'Walk-in'}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Products</dt>
                <dd>{selectedSale.productLabel}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{money(selectedSale.amount)}</dd>
              </div>
              <div>
                <dt>Payment method</dt>
                <dd>{selectedSale.paymentMethod}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`sales-pill ${selectedSale.status}`}>
                    {selectedSale.status === 'paid' ? 'Paid' : 'Unpaid'}
                  </span>
                </dd>
              </div>
            </dl>
            <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => setSelectedSale(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

    </div>

  );

}



function KpiCard({

  label,

  value,

  changeLabel,

  sub,

}: {

  label: string;

  value: string;

  changeLabel?: string | null;

  sub?: string;

}) {

  const changeTone =
    changeLabel?.startsWith('-') ? ' down' : changeLabel ? ' up' : '';

  return (

    <div className="sales-kpi-card">

      <div className="sales-kpi-label">{label}</div>

      <div className="sales-kpi-value">{value}</div>

      {changeLabel ? (

        <div className={`sales-kpi-delta${changeTone}`}>{changeLabel}</div>

      ) : sub ? (

        <div className="sales-kpi-sub">{sub}</div>

      ) : null}

      {changeLabel && sub ? <div className="sales-kpi-sub">{sub}</div> : null}

    </div>

  );

}

export default SalesAnalyticsPage;
