'use client';
import React, { useState, useMemo, useRef } from 'react';
import { RadioIcon, MusicIcon, ShieldIcon, ZapIcon, SparkleIcon, CoinIcon, GamepadIcon, WrenchIcon } from '../icons';

const BOT_INVITE = 'https://discord.com/api/oauth2/authorize?client_id=1466382874587431036&permissions=1099514858544&scope=bot%20applications.commands';

type SubcommandRich = { name: string; desc: string };
type CommandData = {
  name: string;
  displayName: string;
  category: string;
  summary: string;
  description: string;
  subcommands?: string[];
  subcommandsRich?: SubcommandRich[];
  permissions?: string;
  examples?: string[];
  tags?: string[];
};

const CATEGORY_ORDER = ['Music', 'Moderation', 'Economy', 'Fun & Games', 'Automation', 'AI', 'Utility'];

const CAT_META: Record<string, { color: string; Icon: React.FC<{size?:number}> }> = {
  Music:          { color: '#f472b6', Icon: MusicIcon },
  Moderation:     { color: '#fb923c', Icon: ShieldIcon },
  Economy:        { color: '#4ade80', Icon: CoinIcon },
  'Fun & Games':  { color: '#a78bfa', Icon: GamepadIcon },
  Automation:     { color: '#facc15', Icon: ZapIcon },
  AI:             { color: '#22d3ee', Icon: SparkleIcon },
  Utility:        { color: '#94a3b8', Icon: WrenchIcon },
};

const PERM_STYLE: Record<string, { bg: string; color: string }> = {
  Everyone:  { bg: 'rgba(56,189,248,0.1)',  color: '#38bdf8' },
  Moderator: { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24' },
  Admin:     { bg: 'rgba(239,68,68,0.1)',   color: '#f87171' },
};

function CommandCard({ cmd }: { cmd: CommandData }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const cat = CAT_META[cmd.category] ?? CAT_META['Utility'];
  const perm = cmd.permissions ?? 'Everyone';
  const permStyle = PERM_STYLE[perm] ?? PERM_STYLE['Everyone'];

  return (
    <div className="cmd-card" style={{ borderColor: open ? `rgba(${hexToRgb(cat.color)},0.25)` : undefined }}>
      <button
        className="cmd-accordion-trigger"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: '0.5rem', background: `rgba(${hexToRgb(cat.color)},0.1)`, border: `1px solid rgba(${hexToRgb(cat.color)},0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cat.color, flexShrink: 0 }}>
            <cat.Icon size={15} />
          </div>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)' }}>/{cmd.name}</span>
            {cmd.subcommands && cmd.subcommands.length > 0 && (
              <span style={{ marginLeft: '0.375rem', fontSize: '0.7rem', color: 'var(--text-faint)', fontFamily: 'var(--font-heading)' }}>+{cmd.subcommands.length}</span>
            )}
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{cmd.summary}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, fontFamily: 'var(--font-heading)', padding: '0.15rem 0.5rem', borderRadius: 999, background: permStyle.bg, color: permStyle.color, border: `1px solid ${permStyle.color}22` }}>{perm}</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text-faint)', transition: 'transform 0.25s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>
            <path d="M3 5l4 4 4-4"/>
          </svg>
        </div>
      </button>

      <div
        className={`cmd-accordion-body${open ? ' open' : ''}`}
        ref={bodyRef}
        style={{ maxHeight: open ? (bodyRef.current?.scrollHeight ?? 1000) + 'px' : '0px' }}
      >
        <div className="cmd-accordion-inner">
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '1rem' }}>{cmd.description}</p>

          {cmd.subcommandsRich && cmd.subcommandsRich.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)', fontFamily: 'var(--font-heading)', marginBottom: '0.5rem' }}>Subcommands</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {cmd.subcommandsRich.map(sub => (
                  <div key={sub.name} style={{ background: `rgba(${hexToRgb(cat.color)},0.06)`, border: `1px solid rgba(${hexToRgb(cat.color)},0.15)`, borderRadius: '0.375rem', padding: '0.3rem 0.625rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: cat.color, fontWeight: 600 }}>/{cmd.name} {sub.name}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginLeft: '0.375rem' }}>{sub.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cmd.examples && cmd.examples.length > 0 && (
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)', fontFamily: 'var(--font-heading)', marginBottom: '0.375rem' }}>Examples</div>
              {cmd.examples.map((ex, i) => (
                <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent)', background: 'rgba(56,189,248,0.05)', padding: '0.35rem 0.625rem', borderRadius: '0.3rem', marginBottom: '0.25rem' }}>{ex}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

export default function CommandsClient() {
  const [commands, setCommands] = useState<CommandData[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetch('/data/chopsticks-commands.json')
      .then(r => r.json())
      .then(d => { setCommands(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let cmds = commands;
    if (activeCategory !== 'All') cmds = cmds.filter(c => c.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      cmds = cmds.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.subcommands?.some(s => s.toLowerCase().includes(q))
      );
    }
    return cmds;
  }, [commands, search, activeCategory]);

  const grouped = useMemo(() => {
    if (activeCategory !== 'All') return { [activeCategory]: filtered };
    const g: Record<string, CommandData[]> = {};
    CATEGORY_ORDER.forEach(cat => {
      const catCmds = filtered.filter(c => c.category === cat);
      if (catCmds.length) g[cat] = catCmds;
    });
    return g;
  }, [filtered, activeCategory]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    commands.forEach(cmd => { c[cmd.category] = (c[cmd.category] ?? 0) + 1; });
    return c;
  }, [commands]);

  return (
    <div>
      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border)', padding: '5rem 0 3rem', background: 'var(--surface)' }} className="bg-grid">
        <div className="orb orb-blue"   style={{ width: 500, height: 500, top: -200, left: -100, opacity: 0.4 }} />
        <div className="orb orb-violet" style={{ width: 350, height: 350, bottom: -120, right: -60, opacity: 0.35 }} />
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <div className="badge" style={{ marginBottom: '1.25rem' }}><span className="dot-live" /> {commands.length || 101} commands · 7 categories</div>
          <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 700, letterSpacing: '-0.05em', color: 'var(--text)', marginBottom: '1rem', fontFamily: 'var(--font-heading)', lineHeight: 1.0 }}>
            Command Reference
          </h1>
          <p style={{ fontSize: '1rem', color: 'var(--text-muted)', maxWidth: '480px', lineHeight: 1.75 }}>
            Every slash command in one place. Click any card to expand subcommands, examples, and permission requirements.
          </p>
        </div>
      </section>

      {/* Search + filters */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 58, zIndex: 80, backdropFilter: 'blur(12px)' }}>
        <div className="container" style={{ padding: '0.875rem 1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 200 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search commands…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.25rem', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: '0.85rem', outline: 'none', transition: 'border-color 0.15s' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>
          <div className="use-case-filters" style={{ margin: 0, flex: '1 1 auto' }}>
            <button className={`use-case-btn${activeCategory === 'All' ? ' active' : ''}`} onClick={() => setActiveCategory('All')}>
              All ({commands.length})
            </button>
            {CATEGORY_ORDER.map(cat => {
              const meta = CAT_META[cat];
              const count = counts[cat] ?? 0;
              return (
                <button
                  key={cat}
                  className={`use-case-btn${activeCategory === cat ? ' active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                  style={activeCategory === cat ? { background: `rgba(${hexToRgb(meta.color)},0.08)`, borderColor: `rgba(${hexToRgb(meta.color)},0.3)`, color: meta.color } : {}}
                >
                  {cat} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="container" style={{ padding: '2.5rem 1.5rem 5rem' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-faint)' }}>Loading commands…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔍</div>
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontWeight: 600 }}>No commands match "{search}"</div>
            <button onClick={() => { setSearch(''); setActiveCategory('All'); }} style={{ marginTop: '0.75rem', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'var(--font-heading)' }}>Clear filters</button>
          </div>
        )}

        {Object.entries(grouped).map(([cat, cmds]) => {
          const meta = CAT_META[cat] ?? CAT_META['Utility'];
          return (
            <div key={cat} style={{ marginBottom: '3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: `2px solid rgba(${hexToRgb(meta.color)},0.2)` }}>
                <div style={{ width: 32, height: 32, borderRadius: '0.5rem', background: `rgba(${hexToRgb(meta.color)},0.1)`, border: `1px solid rgba(${hexToRgb(meta.color)},0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.color }}>
                  <meta.Icon size={15} />
                </div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', margin: 0 }}>{cat}</h2>
                <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-heading)', fontWeight: 700, color: meta.color, background: `rgba(${hexToRgb(meta.color)},0.08)`, padding: '0.15rem 0.5rem', borderRadius: 999, border: `1px solid rgba(${hexToRgb(meta.color)},0.2)` }}>{cmds.length} commands</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {cmds.map(cmd => <CommandCard key={cmd.name} cmd={cmd} />)}
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '3rem 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>Ready to use all {commands.length || 101} commands in your server?</p>
          <a href={BOT_INVITE} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
            Add Chopsticks to Discord
          </a>
        </div>
      </div>
    </div>
  );
}
