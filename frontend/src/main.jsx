import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, BookOpen, Check, ChevronDown,
  CircleHelp, Clock3, Command, Compass, Gauge, Layers3, LayoutDashboard,
  Menu, MoreHorizontal, Plus, Radio, Search, Settings2, ShieldCheck, X,
  SlidersHorizontal, Sparkles, WalletCards, Zap,
} from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const INDICATORS = ['Price Action', 'RSI', 'EMA crossover', 'MACD', 'Supertrend', 'Volume'];
const demoStrategy = {
  id: 'strat-demo', name: 'NIFTY price action pullback', instrument: 'NIFTY', segment: 'FNO',
  kind: 'Options', timeframe: '5m', enabled: false,
  conditions: [
    { indicator: 'Price Action', parameters: { swing_lookback: 20, body_min_ratio: 0.55, fib_min: 0.382, fib_max: 0.618, momentum_atr: 0.8 }, operator: 'confluence' },
  ],
};

function App() {
  const [strategies, setStrategies] = useState([demoStrategy]);
  const [health, setHealth] = useState(null);
  const [activeView, setActiveView] = useState('Overview');
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(new Date());
  const [signals, setSignals] = useState({});
  const [evaluating, setEvaluating] = useState({});
  const [selectedSignal, setSelectedSignal] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/health`).then(r => r.json()).then(setHealth)
      .catch(() => setHealth({ mode: 'paper', groww_configured: false }));
    fetch(`${API}/api/strategies`).then(r => r.json()).then(setStrategies).catch(() => {});
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const active = strategies.filter(s => s.enabled).length;
  const visibleStrategies = useMemo(() => strategies.filter(s =>
    `${s.name} ${s.instrument} ${s.kind}`.toLowerCase().includes(query.toLowerCase())), [strategies, query]);

  function toast(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  }

  async function toggle(id) {
    try {
      const response = await fetch(`${API}/api/strategies/${id}/toggle`, { method: 'PATCH' });
      if (!response.ok) throw new Error();
      const updated = await response.json();
      setStrategies(rows => rows.map(row => row.id === id ? updated : row));
    } catch { toast('Could not update strategy. Check that the backend is running.'); }
  }

  async function evaluate(strategy) {
    setEvaluating(current => ({ ...current, [strategy.id]: true }));
    try {
      const response = await fetch(`${API}/api/strategies/${strategy.id}/signal`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Could not evaluate strategy.');
      setSignals(current => ({ ...current, [strategy.id]: result }));
    } catch (error) { toast(error.message || 'Could not evaluate strategy.'); }
    finally { setEvaluating(current => ({ ...current, [strategy.id]: false })); }
  }

  async function saveStrategy(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const indicators = form.getAll('indicators');
    if (!indicators.length) return toast('Choose at least one entry indicator.');
    const strategy = {
      name: form.get('name'), instrument: form.get('instrument').toUpperCase(), segment: 'FNO',
      kind: form.get('kind'), timeframe: form.get('timeframe'),
        conditions: indicators.map(indicator => ({
        indicator,
        parameters: indicator === 'Price Action' ? {
          swing_lookback: Number(form.get('swing_lookback')),
          body_min_ratio: Number(form.get('body_min_ratio')) / 100,
          fib_min: Number(form.get('fib_min')) / 100,
          fib_max: Number(form.get('fib_max')) / 100,
          momentum_atr: Number(form.get('momentum_atr')),
        } : indicator === 'EMA crossover' ? { fast: 9, slow: 21 } : { period: 14 },
        operator: indicator === 'Price Action' ? 'confluence' : 'above', value: 50,
      })),
    };
    try {
      const response = await fetch(`${API}/api/strategies`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(strategy),
      });
      if (!response.ok) throw new Error();
      const saved = await response.json();
      setStrategies(rows => [saved, ...rows]);
      setShowForm(false);
      toast('Strategy saved in paused mode.');
    } catch { toast('Could not save strategy. Check that the backend is running.'); }
  }

  const navItems = [
    [LayoutDashboard, 'Overview'], [Layers3, 'Strategies'],
    [Activity, 'Market data'], [WalletCards, 'Portfolio'],
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandmark"><Activity size={19} strokeWidth={2.4} /></div>
          <span>signal<span className="brand-light">forge</span></span>
          <button className="icon-btn collapse" aria-label="Collapse menu"><Menu size={17} /></button>
        </div>
        <button className="workspace" onClick={() => toast('You are in your personal workspace.')}>
          <div className="workspace-icon">SF</div>
          <div><strong>Personal workspace</strong><small>Trading desk</small></div>
          <ChevronDown size={15} />
        </button>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav">
          {navItems.map(([Icon, label]) => (
            <button key={label} onClick={() => setActiveView(label)} className={`nav-item ${activeView === label ? 'selected' : ''}`}>
              <Icon size={17} /><span>{label}</span>{label === 'Strategies' && <span className="nav-count">{strategies.length}</span>}
            </button>
          ))}
        </nav>
        <div className="side-label tools-label">TOOLS</div>
        <nav className="side-nav">
          <button className="nav-item" onClick={() => toast('Indicator library is coming soon.')}><SlidersHorizontal size={17} /><span>Indicator library</span></button>
          <button className="nav-item" onClick={() => toast('Backtesting is not implemented yet.')}><Gauge size={17} /><span>Backtest lab</span><span className="soon">SOON</span></button>
        </nav>
        <div className="side-bottom">
          <div className="help-card">
            <div className="help-icon"><BookOpen size={16} /></div>
            <strong>Build with confidence</strong>
            <p>Review Groww’s API guide before connecting a trading account.</p>
            <a href="https://groww.in/trade-api/docs/curl" target="_blank" rel="noreferrer">Read API guide <ArrowUpRight size={12} /></a>
          </div>
          <div className="user-row"><div className="avatar">IS</div><div><strong>Personal account</strong><small>Local workspace</small></div><Settings2 size={16} /></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb"><span>Workspace</span><span className="crumb-slash">/</span><b>{activeView}</b></div>
          <div className="top-actions">
            <label className="search"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search strategies" aria-label="Search strategies" /><kbd><Command size={10} /> K</kbd></label>
            <button className="icon-btn notification" onClick={() => toast('You’re all caught up.')} aria-label="Notifications"><Bell size={17} /><i /></button>
            <div className="header-avatar">IS</div>
          </div>
        </header>

        <div className="content">
          <section className="welcome">
            <div>
              <div className="eyebrow"><span className="live-dot" /> YOUR TRADING WORKSPACE <span className="divider">·</span> {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()}</div>
              <h1>{activeView === 'Overview' ? 'Good trading starts with a plan.' : activeView}<span className="title-mark"> ✳</span></h1>
              <p>{activeView === 'Overview' ? 'Build, monitor, and refine your futures and options strategies.' : `Your ${activeView.toLowerCase()} workspace at a glance.`}</p>
            </div>
            <button className="primary" onClick={() => setShowForm(true)}><Plus size={16} /> New strategy</button>
          </section>

          <section className="stats">
            <article className="stat-card stat-highlight"><div className="stat-top"><span>STRATEGIES RUNNING</span><span className="stat-icon green"><Zap size={16} /></span></div><div className="stat-value">{String(active).padStart(2, '0')}<small> / {String(strategies.length).padStart(2, '0')}</small></div><div className="stat-foot"><span className="status-pill"><i />{active ? `${active} active` : 'All paused'}</span><span>across your desk</span></div></article>
            <article className="stat-card"><div className="stat-top"><span>SESSION P&amp;L</span><span className="stat-icon"><Activity size={16} /></span></div><div className="stat-value">₹<span className="value-muted">—</span></div><div className="stat-foot"><span className="flat">No executions yet</span><span>paper session</span></div></article>
            <article className="stat-card"><div className="stat-top"><span>OPEN POSITIONS</span><span className="stat-icon"><Layers3 size={16} /></span></div><div className="stat-value">00</div><div className="stat-foot"><span>Futures &amp; options</span><span>connect Groww</span></div></article>
            <article className="stat-card"><div className="stat-top"><span>ACCOUNT MODE</span><span className="stat-icon amber"><ShieldCheck size={16} /></span></div><div className="stat-value mode-value"><span className="mode-dot" />{health?.mode === 'live' ? 'Live mode' : 'Paper mode'}</div><div className="stat-foot"><span className="mode-note">{health?.groww_configured ? 'Groww connected' : 'Groww disconnected'}</span><span>{health?.groww_configured ? 'API ready' : 'API token needed'}</span></div></article>
          </section>

          <div className="section-heading">
            <div><div className="section-kicker"><span className="section-kicker-line" /> STRATEGY CONTROL</div><h2>Strategy monitor</h2><p>Review each algorithm before it can act on the market.</p></div>
            <div className="table-tools"><span className="monitor-count"><Radio size={13} /> {active ? 'MONITORING' : 'STANDBY'}</span><button className="filter-btn" onClick={() => setQuery('')}><Search size={14} /> Clear search</button></div>
          </div>

          <section className="table-card">
            <div className="table-head"><span>STRATEGY</span><span>CONTRACT</span><span>INTERVAL</span><span>ENTRY CONDITIONS</span><span>STATE</span><span>LAST SIGNAL</span><span /></div>
            {visibleStrategies.map((strategy, index) => (
              <div className="strategy-row" key={strategy.id}>
                <div className="strategy-name"><div className={`strategy-symbol symbol-${index % 3}`}>{strategy.kind === 'Futures' ? 'F' : strategy.kind === 'Options' ? 'O' : 'E'}</div><div><strong>{strategy.name}</strong><small>{strategy.kind} algorithm <span>·</span> {strategy.enabled ? 'Ready to monitor' : 'Paused by you'}</small></div></div>
                <div className="instrument"><b>{strategy.instrument}</b><small>{strategy.segment} <span className="exchange-tag">NSE</span></small></div>
                <div><span className="timeframe">{strategy.timeframe}</span></div>
                <div className="condition-list">{strategy.conditions?.map((condition, i) => <span key={i}>{condition.indicator}</span>)}</div>
                <div className="state-cell"><button onClick={() => toggle(strategy.id)} className={`toggle ${strategy.enabled ? 'on' : ''}`} aria-label={`${strategy.enabled ? 'Pause' : 'Run'} ${strategy.name}`}><i /></button><span className={`state ${strategy.enabled ? 'running' : 'paused'}`}>{strategy.enabled ? 'Running' : 'Paused'}</span></div>
                <div className="signal-cell">{signals[strategy.id] ? <button className={`signal-result ${signals[strategy.id].signal === 'LONG' ? 'signal-long' : signals[strategy.id].signal === 'SHORT' ? 'signal-short' : ''}`} title={signals[strategy.id].message} onClick={() => setSelectedSignal({ strategy, result: signals[strategy.id] })}><span className="neutral-dot" />{signals[strategy.id].status === 'WAITING_FOR_MARKET_DATA' ? 'Connect Groww' : signals[strategy.id].signal === 'NEUTRAL' ? 'No setup' : `${signals[strategy.id].signal} candidate`}</button> : <button className="signal-preview" onClick={() => evaluate(strategy)} disabled={evaluating[strategy.id]}><Sparkles size={12} />{evaluating[strategy.id] ? 'Checking…' : 'Evaluate'}</button>}</div>
                <button className="row-more" aria-label="Strategy options" onClick={() => toast('Strategy settings are coming soon.')}><MoreHorizontal size={17} /></button>
              </div>
            ))}
            {visibleStrategies.length === 0 && <div className="empty"><div className="empty-icon"><Compass size={20} /></div><strong>{strategies.length ? 'No matching strategies' : 'Your strategy desk is clear'}</strong><span>{strategies.length ? 'Try another name or instrument.' : 'Create an algorithm to start shaping your trading workflow.'}</span>{!strategies.length && <button className="primary" onClick={() => setShowForm(true)}><Plus size={14} /> Create strategy</button>}</div>}
            {visibleStrategies.length > 0 && <div className="table-footer"><span>Showing <b>{visibleStrategies.length}</b> of <b>{strategies.length}</b> strategies <span className="footer-divider">·</span> Paper execution</span><span className="table-foot-safe"><ShieldCheck size={13} /> Live orders require explicit setup</span></div>}
          </section>

          <div className="lower-grid">
            <section className="panel market-panel">
              <div className="panel-heading"><div><div className="section-kicker"><span className="section-kicker-line blue" /> MARKET DATA</div><h2>F&amp;O watchlist</h2><p>Connect Groww to load live contracts and prices.</p></div><span className="connection-badge"><i className={health?.groww_configured ? 'connected' : ''} />{health?.groww_configured ? 'CONNECTED' : 'OFFLINE'}</span></div>
              {health?.groww_configured ? <div className="connected-note"><Check size={16} /> Groww API is configured. Live market widgets can be enabled from the backend.</div> : <div className="market-empty"><div className="market-empty-icon"><Activity size={18} /></div><div><strong>No live quotes yet</strong><span>Prices stay hidden until a Groww token is configured.</span></div><button onClick={() => toast('Add GROWW_ACCESS_TOKEN to backend/.env, then restart the API.')}>Setup guide <ArrowUpRight size={12} /></button></div>}
              <div className="market-foot"><span><Clock3 size={12} /> {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} local</span><span>Quotes are never simulated</span></div>
            </section>
            <section className="panel activity-panel">
              <div className="panel-heading"><div><div className="section-kicker"><span className="section-kicker-line gold" /> WORKSPACE HEALTH</div><h2>Connection status</h2><p>Services connected to this workspace.</p></div><button className="icon-btn" aria-label="Help" onClick={() => toast('Paper mode is the safe default for this workspace.')}><CircleHelp size={16} /></button></div>
              <div className="service-row"><div className="service-mark backend-mark"><Activity size={14} /></div><div><strong>Strategy API</strong><small>Local service · port 8000</small></div><span className="service-state"><i className={health ? 'connected' : ''} />{health ? 'Online' : 'Connecting'}</span></div>
              <div className="service-row"><div className="service-mark groww-mark"><span>G</span></div><div><strong>Groww Trading API</strong><small>{health?.groww_configured ? 'Access token detected' : 'No access token detected'}</small></div><span className="service-state"><i className={health?.groww_configured ? 'connected' : ''} />{health?.groww_configured ? 'Ready' : 'Not linked'}</span></div>
              <div className="safety-note"><ShieldCheck size={15} /><span><b>Paper mode is active.</b> The app will not send live orders in this mode.</span></div>
            </section>
          </div>

          <footer><span>SignalForge <span className="footer-dot">·</span> <b>0.1.0</b></span><span className="api-status"><i className={health ? '' : 'offline'} />{health ? 'Backend online' : 'Connecting to backend'} <span>·</span> <a href="https://groww.in/trade-api/docs/curl" target="_blank" rel="noreferrer">Groww API docs <ArrowUpRight size={11} /></a></span></footer>
        </div>
      </main>

      {notice && <div className="toast" role="status"><Sparkles size={15} />{notice}</div>}
      {selectedSignal && <div className="modal-backdrop" onClick={() => setSelectedSignal(null)}><section className="signal-report" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="signal-title"><div className="report-header"><div><span className="eyebrow">PRICE ACTION EVALUATION</span><h2 id="signal-title">{selectedSignal.strategy.instrument} <span>·</span> {selectedSignal.strategy.timeframe}</h2><p>{selectedSignal.result.data_symbol ? `Candles from ${selectedSignal.result.data_symbol}` : 'Groww market data connection'}</p></div><button className="icon-btn close-modal" onClick={() => setSelectedSignal(null)} aria-label="Close report"><X size={16} /></button></div><div className={`report-outcome ${selectedSignal.result.signal === 'LONG' ? 'outcome-long' : selectedSignal.result.signal === 'SHORT' ? 'outcome-short' : ''}`}><div><span className="outcome-kicker">{selectedSignal.result.status === 'WAITING_FOR_MARKET_DATA' ? 'DATA NEEDED' : selectedSignal.result.signal === 'NEUTRAL' ? 'NO ENTRY' : 'CANDIDATE SIGNAL'}</span><strong>{selectedSignal.result.status === 'WAITING_FOR_MARKET_DATA' ? 'Connect Groww to evaluate' : selectedSignal.result.signal === 'NEUTRAL' ? 'Conditions did not align' : `${selectedSignal.result.signal} setup`}</strong><p>{selectedSignal.result.message}</p></div>{selectedSignal.result.confidence_score != null && <div className="score-ring"><b>{selectedSignal.result.confidence_score}</b><small>rule score</small></div>}</div>{selectedSignal.result.rules?.length > 0 ? <div className="report-rules"><div className="report-section-title">CONFLUENCE CHECKS <span>{selectedSignal.result.candles_used} candles</span></div>{selectedSignal.result.rules.map((rule, index) => <div className="report-rule" key={index}><span className={`rule-mark ${rule.passed ? 'passed' : ''}`}>{rule.passed ? <Check size={13} /> : <span>·</span>}</span><div><b>{rule.rule}</b><small>{rule.detail}</small></div></div>)}</div> : <div className="report-wait"><Radio size={15} />{selectedSignal.result.message}</div>}{selectedSignal.result.swing && <div className="report-levels"><span>SWING LOW <b>{selectedSignal.result.swing.low}</b></span><span>38.2% <b>{selectedSignal.result.swing.fib_38_2}</b></span><span>61.8% <b>{selectedSignal.result.swing.fib_61_8}</b></span><span>SWING HIGH <b>{selectedSignal.result.swing.high}</b></span></div>}<div className="report-footer"><ShieldCheck size={14} /> Rule match only. This preview does not place an order or represent a win probability.</div></section></div>}
      {showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}>
        <form className="modal" onSubmit={saveStrategy} onClick={event => event.stopPropagation()}>
          <div className="modal-title"><div><span className="eyebrow">STRATEGY BUILDER</span><h2>Create a strategy</h2><p>Define an instrument and the signals that should align.</p></div><button type="button" className="icon-btn close-modal" onClick={() => setShowForm(false)} aria-label="Close">×</button></div>
          <label>Strategy name<input name="name" required placeholder="e.g. NIFTY momentum" /></label>
          <div className="form-row"><label>Underlying<input name="instrument" required defaultValue="NIFTY" /></label><label>Contract type<select name="kind"><option>Options</option><option>Futures</option></select></label></div>
          <label>Chart interval<select name="timeframe"><option>5m</option><option>1m</option><option>15m</option><option>1h</option><option>1d</option></select></label>
          <fieldset className="indicator-options"><legend>Entry rules <small>Price Action is ready to evaluate</small></legend>{INDICATORS.map((indicator, index) => <label key={indicator}><input type="checkbox" name="indicators" value={indicator} defaultChecked={index === 0} /><span>{indicator}{index > 0 && <em>coming soon</em>}</span></label>)}</fieldset>
          <div className="price-action-settings"><div className="settings-intro"><Sparkles size={14} /><span><b>Price action confluence</b><small>Entries require momentum, a fib-zone pullback, candle confirmation, and 3 of 5 checks.</small></span></div><div className="settings-grid"><label>Swing bars<input name="swing_lookback" type="number" min="8" max="80" defaultValue="20" /></label><label>Min body %<input name="body_min_ratio" type="number" min="25" max="90" defaultValue="55" /></label><label>Momentum ATR<input name="momentum_atr" type="number" min="0.1" max="4" step="0.1" defaultValue="0.8" /></label><label>Fib zone %<div className="fib-range"><input name="fib_min" type="number" min="10" max="80" defaultValue="38.2" step="0.1" /><span>to</span><input name="fib_max" type="number" min="20" max="90" defaultValue="61.8" step="0.1" /></div></label></div></div>
          <div className="form-note"><ShieldCheck size={15} /><span>Saved paused. Signals are not evaluated until candle data is connected.</span></div>
          <button className="primary modal-submit"><Plus size={15} /> Create strategy</button>
        </form>
      </div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
