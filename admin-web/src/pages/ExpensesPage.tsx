import { useCallback, useEffect, useMemo, useState } from 'react';

import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import {
  EXPENSE_TYPES,
  expenseTypeLabel,
  formatExpenseDateLabel,
  todayDateInputValue,
  type ExpenseType,
} from '../lib/expenseTypes';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';

type ExpenseRow = {
  id: string;
  expense_type: ExpenseType;
  others_label: string | null;
  amount: number;
  expense_date: string;
  notes: string | null;
  created_at: string;
};

export function ExpensesPage() {
  const { businessId } = useAuth();
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [viewDate, setViewDate] = useState(todayDateInputValue);
  const [viewAllDates, setViewAllDates] = useState(false);

  const [expenseType, setExpenseType] = useState<ExpenseType>('water_bill');
  const [othersLabel, setOthersLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayDateInputValue);
  const [notes, setNotes] = useState('');

  const today = todayDateInputValue();
  const isViewingToday = !viewAllDates && viewDate === today;

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setLoadError(null);
    let query = supabase
      .from('business_expenses')
      .select('id,expense_type,others_label,amount,expense_date,notes,created_at')
      .eq('seller_id', businessId);

    if (!viewAllDates) {
      query = query.eq('expense_date', viewDate);
    }

    const { data, error: err } = await query
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(viewAllDates ? 200 : 100);

    if (err) setLoadError(err.message);
    setRows((data ?? []) as ExpenseRow[]);
    setLoading(false);
  }, [businessId, viewAllDates, viewDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-expenses-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'business_expenses', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, load]);

  const dayTotal = useMemo(() => rows.reduce((sum, r) => sum + Number(r.amount), 0), [rows]);

  const listTitle = viewAllDates ? 'All recent expenses' : `Expenses on ${formatExpenseDateLabel(viewDate)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('Enter a valid amount greater than zero.');
      return;
    }
    if (expenseType === 'others' && !othersLabel.trim()) {
      setFormError('Please describe the expense under Others.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const { error: err } = await supabase.from('business_expenses').insert({
        seller_id: businessId,
        expense_type: expenseType,
        others_label: expenseType === 'others' ? othersLabel.trim() : null,
        amount: amt,
        expense_date: expenseDate,
        notes: notes.trim() || null,
      });
      if (err) throw err;
      setAmount('');
      setOthersLabel('');
      setNotes('');
      setExpenseType('water_bill');
      setExpenseDate(todayDateInputValue());
      if (!viewAllDates) setViewDate(expenseDate);
      await load();
    } catch (ex) {
      setFormError(ex instanceof Error ? ex.message : 'Could not save expense');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!businessId) return;
    if (!window.confirm('Delete this expense entry?')) return;
    setLoadError(null);
    const { error: err } = await supabase.from('business_expenses').delete().eq('id', id).eq('seller_id', businessId);
    if (err) setLoadError(err.message);
    else await load();
  }

  function showToday() {
    setViewAllDates(false);
    setViewDate(todayDateInputValue());
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Pick a date to review costs, then add new entries below. Dashboard net income uses today's sales minus today's expenses."
      />

      <div className="card card-flat expenses-filter-card">
        <div className="expenses-filter-head">
          <div>
            <h2 className="card-title expenses-section-title">View by date</h2>
            <p className="expenses-section-hint">Choose which day to review. Add new expenses in the form below.</p>
          </div>
        </div>
        <div className="expenses-filter-toolbar">
          <div className="field expenses-filter-date-field">
            <label htmlFor="exp-view-date">Date</label>
            <input
              id="exp-view-date"
              type="date"
              value={viewDate}
              disabled={viewAllDates}
              onChange={(e) => {
                setViewAllDates(false);
                setViewDate(e.target.value);
              }}
            />
          </div>
          <div className="expenses-filter-actions">
            <button
              type="button"
              className={`btn btn-sm ${isViewingToday ? 'btn-primary btn-water' : 'btn-ghost'}`}
              onClick={showToday}
            >
              Today
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewAllDates ? 'btn-primary btn-water' : 'btn-ghost'}`}
              onClick={() => setViewAllDates(true)}
            >
              All dates
            </button>
          </div>
        </div>
      </div>

      <div className="grid-stats expenses-summary-row">
        <div className="stat-card">
          <div className="label">{viewAllDates ? 'Entries shown' : 'Entries this day'}</div>
          <div className="value">{loading ? '…' : rows.length}</div>
        </div>
        <div className="stat-card stat-card--expense">
          <div className="label">{viewAllDates ? 'Total (shown list)' : 'Total this day'}</div>
          <div className="value">{loading ? '…' : money(dayTotal)}</div>
        </div>
      </div>

      <div className="card card-flat expenses-form-card">
        <h2 className="card-title expenses-section-title">Add expense</h2>
        <p className="expenses-section-hint">New entry — separate from the date filter above.</p>
        {formError ? <p className="error-text">{formError}</p> : null}
        <form className="expenses-form" onSubmit={(e) => void submit(e)}>
          <div className="expenses-form-row">
            <div className="field">
              <label htmlFor="exp-type">Type</label>
              <select id="exp-type" value={expenseType} onChange={(e) => setExpenseType(e.target.value as ExpenseType)}>
                {EXPENSE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="exp-amount">Amount (₱)</label>
              <input
                id="exp-amount"
                type="number"
                min={0.01}
                step="0.01"
                placeholder="e.g. 1500.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>
          {expenseType === 'others' ? (
            <div className="field">
              <label htmlFor="exp-others">Others — describe</label>
              <input
                id="exp-others"
                value={othersLabel}
                onChange={(e) => setOthersLabel(e.target.value)}
                placeholder="e.g. Maintenance, supplies"
                required
              />
            </div>
          ) : null}
          <div className="expenses-form-row">
            <div className="field">
              <label htmlFor="exp-date">Expense date</label>
              <input
                id="exp-date"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="exp-notes">Notes (optional)</label>
              <input
                id="exp-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Receipt ref, remarks…"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-water expenses-form-submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save expense'}
          </button>
        </form>
      </div>

      <div className="card expenses-list-card">
        <h2 className="expenses-list-title">{listTitle}</h2>
        {loadError ? <p className="error-text">{loadError}</p> : null}
        {loading ? <p className="muted-block">Loading…</p> : null}
        {!loading && rows.length === 0 ? (
          <p className="muted-block">
            {viewAllDates ? 'No expenses recorded yet.' : `No expenses on ${formatExpenseDateLabel(viewDate)}.`}
          </p>
        ) : null}
        {!loading && rows.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table expenses-table">
              <thead>
                <tr>
                  {viewAllDates ? <th>Date</th> : null}
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    {viewAllDates ? <td>{formatExpenseDateLabel(r.expense_date)}</td> : null}
                    <td>{expenseTypeLabel(r.expense_type, r.others_label)}</td>
                    <td>{money(Number(r.amount))}</td>
                    <td>{r.notes?.trim() || '—'}</td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(r.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  );
}
