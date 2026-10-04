import { useCallback, useEffect, useMemo, useState } from 'react';

import { SalesBarChart, SalesDonutChart } from '../components/SalesCharts';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { useAuth } from '../auth/AuthProvider';
import { money } from '../lib/format';
import {
  downloadLaundryMonthSpreadsheet,
  downloadLaundryYearSpreadsheet,
} from '../lib/exportLaundrySpreadsheet';
import {
  fetchLaundryMonthExportPayload,
  fetchLaundryYearExportPayload,
  loadLaundrySalesView,
} from '../lib/laundrySalesReportData';
import { pctChange, type SalesDashboardData, type SalesDisplayMode } from '../lib/salesReportData';

type DisplayGranularity = 'month' | 'year';

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

export function LaundrySalesPage() {
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

  const branch = profile?.display_name?.trim() ? `${profile.display_name.trim()} · Laundry` : 'Zoda Laundry';
  const { year: filterYear, month: filterMonth } = useMemo(
    () => parseDateInput(selectedDate),
    [selectedDate]
  );
  const analyticsMode: SalesDisplayMode = displayGranularity === 'month' ? 'day' : 'month';

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const dash = await loadLaundrySalesView(businessId, analyticsMode, filterYear, filterMonth);
      setData(dash);
    } finally {
      setLoading(false);
    }
  }, [businessId, analyticsMode, filterYear, filterMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const filterLabel =
    displayGranularity === 'month'
      ? new Date(filterYear, filterMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : String(filterYear);

  const salesPct = data ? pctChange(data.totalSales, data.prevTotalSales) : null;
  const ordersPct = data ? pctChange(data.totalOrderCount, data.prevTotalOrders) : null;
  const chartSlotWidth = displayGranularity === 'month' ? 44 : 52;
  const yearOptions = Array.from({ length: 8 }, (_, i) => now.getFullYear() - i);
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'long' }),
  }));

  async function handleExportMonth() {
    if (!businessId) return;
    setExporting('month');
    setExportError(null);
    try {
      const payload = await fetchLaundryMonthExportPayload(businessId, exportYear, exportMonth);
      const name = `zoda-laundry-sales-${exportYear}-${String(exportMonth + 1).padStart(2, '0')}.xlsx`;
      await downloadLaundryMonthSpreadsheet(payload, name);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setExporting(null);
    }
  }

  async function handleExportYear() {
    if (!businessId) return;
    setExporting('year');
    setExportError(null);
    try {
      const payload = await fetchLaundryYearExportPayload(businessId, exportYear);
      await downloadLaundryYearSpreadsheet(payload, `zoda-laundry-sales-${exportYear}.xlsx`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="sales-analytics-layout">
      <ModulePageHeader
        title="Laundry sales & analytics"
        subtitle="POS transactions, trends, and top services."
        branch={branch}
      />
      {exportError ? <p className="error-text module-alert">{exportError}</p> : null}

      <div className="sales-toolbar card card-flat">
        <div className="sales-toolbar-filter">
          <div className="sales-toolbar-filter-head">
            <span className="sales-toolbar-heading">Display by</span>
            <div className="sales-period-tabs">
              {(['month', 'year'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`pos-category-tab${displayGranularity === id ? ' active' : ''}`}
                  onClick={() => setDisplayGranularity(id)}
                >
                  {id === 'month' ? 'Month' : 'Year'}
                </button>
              ))}
            </div>
          </div>
          <label className="sales-date-picker-btn">
            <span className="sales-date-picker-text">
              <span className="sales-date-picker-label">Select date</span>
              <strong>{filterLabel}</strong>
            </span>
            <input
              type="date"
              className="sales-date-input-overlay"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
            />
          </label>
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

      {loading ? <p className="muted-block">Loading…</p> : null}

      {data ? (
        <>
          <div className="sales-kpi-grid">
            <div className="sales-kpi-card">
              <div className="sales-kpi-label">Total sales</div>
              <div className="sales-kpi-value">{money(data.totalSales)}</div>
              {salesPct != null ? (
                <div className={`sales-kpi-delta${salesPct >= 0 ? ' up' : ' down'}`}>
                  {salesPct >= 0 ? '+' : ''}
                  {salesPct.toFixed(0)}% vs previous period
                </div>
              ) : null}
            </div>
            <div className="sales-kpi-card">
              <div className="sales-kpi-label">Transactions</div>
              <div className="sales-kpi-value">{data.totalOrderCount}</div>
              {ordersPct != null ? (
                <div className={`sales-kpi-delta${ordersPct >= 0 ? ' up' : ' down'}`}>
                  {ordersPct >= 0 ? '+' : ''}
                  {ordersPct.toFixed(0)}% vs previous period
                </div>
              ) : null}
            </div>
            <div className="sales-kpi-card">
              <div className="sales-kpi-label">Avg. ticket</div>
              <div className="sales-kpi-value">
                {money(data.totalOrderCount > 0 ? data.totalSales / data.totalOrderCount : 0)}
              </div>
            </div>
          </div>

          <div className="sales-charts-grid">
            <div className="card card-flat sales-chart-card">
              <h2 className="inventory-section-title">Sales overview</h2>
              <div className="sales-chart-legend">
                <span><i className="lg total" /> Total (bar height)</span>
                <span><i className="lg walk" /> POS sales</span>
              </div>
              <SalesBarChart points={data.timeline} slotWidth={chartSlotWidth} />
            </div>
            <div className="card card-flat sales-chart-card">
              <h2 className="inventory-section-title">POS sales</h2>
              <SalesDonutChart online={0} walkIn={data.walkInSales} total={data.totalSales} />
            </div>
          </div>

          {data.topProducts.length > 0 ? (
            <div className="card card-flat" style={{ marginTop: 16 }}>
              <h2 className="inventory-section-title">Top services</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Qty</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td>{p.units}</td>
                        <td>{money(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="card card-flat" style={{ marginTop: 16 }}>
            <h2 className="inventory-section-title">Recent transactions</h2>
            <ul className="history-list">
              {data.recentSales.map((r) => (
                <li key={r.id}>
                  <strong>{r.at.toLocaleString()}</strong> — {money(r.amount)} · {r.productLabel}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
