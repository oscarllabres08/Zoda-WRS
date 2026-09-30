import { useCallback, useEffect, useMemo, useState } from 'react';



import { CategoryBarChart, SalesDonutChart, SalesLineChart } from '../components/SalesCharts';

import { ModulePageHeader } from '../components/ModulePageHeader';

import { useAuth } from '../auth/AuthProvider';

import { downloadMonthSpreadsheet, downloadYearSpreadsheet } from '../lib/exportSalesSpreadsheet';

import { money } from '../lib/format';

import {

  fetchMonthExportPayload,

  fetchYearExportPayload,

  loadSalesAnalyticsView,

  pctChange,

  type SalesDashboardData,

  type SalesDisplayMode,

} from '../lib/salesReportData';



type DisplayGranularity = 'month' | 'year';



const DISPLAY_GRANULARITY: { id: DisplayGranularity; label: string }[] = [

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

  const { businessId, profile } = useAuth();

  const [displayGranularity, setDisplayGranularity] = useState<DisplayGranularity>('month');

  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));

  const [data, setData] = useState<SalesDashboardData | null>(null);

  const [loading, setLoading] = useState(true);

  const [exporting, setExporting] = useState<'month' | 'year' | null>(null);

  const [exportError, setExportError] = useState<string | null>(null);

  const now = new Date();

  const [exportYear, setExportYear] = useState(now.getFullYear());

  const [exportMonth, setExportMonth] = useState(now.getMonth());



  const branch =

    profile?.display_name?.trim() ? `${profile.display_name.trim()} · Zoda WRS` : 'Zoda WRS Main Branch';



  const { year: filterYear, month: filterMonth, day: filterDay } = useMemo(

    () => parseDateInput(selectedDate),

    [selectedDate]

  );



  const analyticsMode: SalesDisplayMode = displayGranularity === 'month' ? 'day' : 'month';



  const load = useCallback(async () => {

    if (!businessId) return;

    setLoading(true);

    try {

      const dash = await loadSalesAnalyticsView(businessId, analyticsMode, filterYear, filterMonth);

      setData(dash);

    } finally {

      setLoading(false);

    }

  }, [businessId, analyticsMode, filterYear, filterMonth]);



  useEffect(() => {

    void load();

  }, [load]);



  const selectedDateLabel = useMemo(() => {

    const d = new Date(filterYear, filterMonth, filterDay);

    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });

  }, [filterYear, filterMonth, filterDay]);



  const filterLabel = useMemo(() => {

    if (displayGranularity === 'month') {

      return new Date(filterYear, filterMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    }

    return String(filterYear);

  }, [displayGranularity, filterYear, filterMonth]);



  const chartSlotWidth = displayGranularity === 'month' ? 44 : 52;



  const salesPct = data ? pctChange(data.totalSales, data.prevTotalSales) : null;

  const ordersPct = data ? pctChange(data.totalOrderCount, data.prevTotalOrders) : null;



  const onlineShare = data && data.totalSales > 0 ? (data.onlineSales / data.totalSales) * 100 : 0;

  const walkShare = data && data.totalSales > 0 ? (data.walkInSales / data.totalSales) * 100 : 0;

  const paidShare = data && data.totalOrderCount > 0 ? (data.paidOrders / data.totalOrderCount) * 100 : 0;

  const unpaidShare = data && data.totalOrderCount > 0 ? (data.unpaidOrders / data.totalOrderCount) * 100 : 0;



  async function handleExportMonth() {

    if (!businessId) return;

    setExporting('month');

    setExportError(null);

    try {

      const payload = await fetchMonthExportPayload(businessId, exportYear, exportMonth);

      const name = `zoda-wrs-sales-${exportYear}-${String(exportMonth + 1).padStart(2, '0')}.xlsx`;

      await downloadMonthSpreadsheet(payload, name);

    } catch (e) {

      setExportError(e instanceof Error ? e.message : 'Export failed. Check your internet connection and try again.');

    } finally {

      setExporting(null);

    }

  }



  async function handleExportYear() {

    if (!businessId) return;

    setExporting('year');

    setExportError(null);

    try {

      const payload = await fetchYearExportPayload(businessId, exportYear);

      await downloadYearSpreadsheet(payload, `zoda-wrs-sales-${exportYear}.xlsx`);

    } catch (e) {

      setExportError(e instanceof Error ? e.message : 'Export failed. Check your internet connection and try again.');

    } finally {

      setExporting(null);

    }

  }



  const yearOptions = Array.from({ length: 8 }, (_, i) => now.getFullYear() - i);

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({

    value: i,

    label: new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'long' }),

  }));



  return (

    <div className="sales-analytics-layout">

      <ModulePageHeader

        title="Sales & Analytics"

        subtitle="Track your sales performance and business insights."

        branch={branch}

      />

      {exportError ? <p className="error-text module-alert">{exportError}</p> : null}



      <div className="sales-toolbar card card-flat">

        <div className="sales-toolbar-filter">

          <div className="sales-toolbar-filter-head">

            <span className="sales-toolbar-heading">Display by</span>

            <div className="sales-period-tabs">

              {DISPLAY_GRANULARITY.map((p) => (

                <button

                  key={p.id}

                  type="button"

                  className={`pos-category-tab${displayGranularity === p.id ? ' active' : ''}`}

                  onClick={() => setDisplayGranularity(p.id)}

                >

                  {p.label}

                </button>

              ))}

            </div>

          </div>

          <div className="sales-filter-fields">

            <label className="sales-date-picker-btn">

              <span className="sales-date-picker-icon" aria-hidden>

                📅

              </span>

              <span className="sales-date-picker-text">

                <span className="sales-date-picker-label">Select date</span>

                <strong>{selectedDateLabel}</strong>

              </span>

              <input

                type="date"

                className="sales-date-input-overlay"

                value={selectedDate}

                onChange={(e) => {

                  if (e.target.value) setSelectedDate(e.target.value);

                }}

                aria-label="Select day, month, and year"

              />

            </label>

            <p className="sales-filter-summary">

              Chart: <strong>{filterLabel}</strong>

              {displayGranularity === 'month' ? ` · ${data?.timeline.length ?? 0} days` : ' · 12 months'}

            </p>

          </div>

        </div>



        <div className="sales-toolbar-export">

          <span className="sales-export-title">Export report (Excel / Google Sheets)</span>

          <div className="sales-export-stack">

            <div className="sales-export-line">

              <select

                className="sales-export-select"

                value={exportMonth}

                onChange={(e) => setExportMonth(Number(e.target.value))}

                aria-label="Select month to export"

              >

                {monthOptions.map((m) => (

                  <option key={m.value} value={m.value}>

                    {m.label}

                  </option>

                ))}

              </select>

              <button

                type="button"

                className="btn btn-primary btn-sm sales-export-action"

                disabled={exporting !== null}

                onClick={() => void handleExportMonth()}

              >

                {exporting === 'month' ? 'Exporting…' : 'Export'}

              </button>

            </div>

            <div className="sales-export-line">

              <select

                className="sales-export-select"

                value={exportYear}

                onChange={(e) => setExportYear(Number(e.target.value))}

                aria-label="Select year to export"

              >

                {yearOptions.map((y) => (

                  <option key={y} value={y}>

                    {y}

                  </option>

                ))}

              </select>

              <button

                type="button"

                className="btn btn-primary btn-sm sales-export-action"

                disabled={exporting !== null}

                onClick={() => void handleExportYear()}

              >

                {exporting === 'year' ? 'Exporting…' : 'Export'}

              </button>

            </div>

          </div>

        </div>

      </div>



      {loading ? <p className="muted-block">Loading sales data…</p> : null}



      {data ? (

        <>

          <div className="sales-kpi-grid">

            <KpiCard label="Total Sales" value={money(data.totalSales)} delta={salesPct} />

            <KpiCard label="Total Orders" value={String(data.totalOrderCount)} delta={ordersPct} />

            <KpiCard label="Online Sales" value={money(data.onlineSales)} sub={`${onlineShare.toFixed(0)}% of total sales`} />

            <KpiCard label="Walk-in Sales" value={money(data.walkInSales)} sub={`${walkShare.toFixed(0)}% of total sales`} />

            <KpiCard label="Paid Orders" value={String(data.paidOrders)} sub={`${paidShare.toFixed(0)}% of orders`} />

            <KpiCard label="Unpaid Orders" value={String(data.unpaidOrders)} sub={`${unpaidShare.toFixed(0)}% of orders`} />

          </div>



          <div className="sales-charts-grid">

            <div className="card card-flat sales-chart-card">

              <h2 className="inventory-section-title">Sales Overview</h2>

              <div className="sales-chart-legend">

                <span><i className="lg total" /> Total</span>

                <span><i className="lg online" /> Online</span>

                <span><i className="lg walk" /> Walk-in</span>

              </div>

              <SalesLineChart points={data.timeline} slotWidth={chartSlotWidth} />

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



          <div className="sales-lower-grid">

            <div className="card card-flat">

              <h2 className="inventory-section-title">Top Selling Products</h2>

              {data.topProducts.length === 0 ? (

                <p className="muted-block">No sales in this period.</p>

              ) : (

                <ol className="sales-top-list">

                  {data.topProducts.map((p, i) => (

                    <li key={p.name}>

                      <span className="sales-top-rank">{i + 1}</span>

                      <div className="sales-top-body">

                        <strong>{p.name}</strong>

                        <span className="muted-block">{p.units} sold</span>

                      </div>

                      <span className="sales-top-revenue">{money(p.revenue)}</span>

                    </li>

                  ))}

                </ol>

              )}

            </div>



            <div className="card card-flat">

              <h2 className="inventory-section-title">Recent Sales</h2>

              <div className="table-wrap">

                <table className="data-table sales-recent-table">

                  <thead>

                    <tr>

                      <th>Date &amp; Time</th>

                      <th>Product</th>

                      <th>Type</th>

                      <th>Amount</th>

                      <th>Status</th>

                    </tr>

                  </thead>

                  <tbody>

                    {data.recentSales.length === 0 ? (

                      <tr>

                        <td colSpan={5} className="muted-block">

                          No transactions yet.

                        </td>

                      </tr>

                    ) : (

                      data.recentSales.map((r) => (

                        <tr key={r.id}>

                          <td>

                            {r.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},{' '}

                            {r.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}

                          </td>

                          <td>{r.productLabel}</td>

                          <td>

                            <span className={`sales-pill ${r.type === 'online' ? 'online' : 'walk'}`}>

                              {r.type === 'online' ? 'Online' : 'Walk-in'}

                            </span>

                          </td>

                          <td>{money(r.amount)}</td>

                          <td>

                            <span className={`sales-pill ${r.status}`}>{r.status === 'paid' ? 'Paid' : 'Unpaid'}</span>

                          </td>

                        </tr>

                      ))

                    )}

                  </tbody>

                </table>

              </div>

            </div>

          </div>

        </>

      ) : null}

    </div>

  );

}



function KpiCard({

  label,

  value,

  delta,

  sub,

}: {

  label: string;

  value: string;

  delta?: number | null;

  sub?: string;

}) {

  return (

    <div className="sales-kpi-card">

      <div className="sales-kpi-label">{label}</div>

      <div className="sales-kpi-value">{value}</div>

      {delta != null ? (

        <div className={`sales-kpi-delta${delta >= 0 ? ' up' : ' down'}`}>

          {delta >= 0 ? '+' : ''}

          {delta.toFixed(0)}% vs previous period

        </div>

      ) : sub ? (

        <div className="sales-kpi-sub">{sub}</div>

      ) : null}

      {delta != null && sub ? <div className="sales-kpi-sub">{sub}</div> : null}

    </div>

  );

}

