'use client';
import React, { useState, useEffect, useRef } from 'react';

const GITHUB = 'https://github.com/WokSpec/Chopsticks';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={copy} aria-label="Copy code">
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="code-block-wrapper" style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
      <pre className="docs-code">{children}</pre>
      <CopyButton text={children.trim()} />
    </div>
  );
}

function Ic({ children }: { children: React.ReactNode }) {
  return <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82em', background: 'rgba(255,255,255,0.07)', padding: '0.1em 0.4em', borderRadius: '0.25rem', color: 'var(--accent)' }}>{children}</code>;
}

type NavItem = { id: string; label: string };
const NAV_ITEMS: NavItem[] = [
  { id: 'overview',      label: 'Overview' },
  { id: 'hosted',        label: 'Hosted quickstart' },
  { id: 'self-host',     label: 'Self-hosting' },
  { id: 'reskin',        label: 'Reskinning' },
  { id: 'per-server',    label: 'Per-server themes' },
  { id: 'feature-flags', label: 'Feature flags' },
  { id: 'agent-pool',    label: 'Agent Pool' },
  { id: 'contributing',  label: 'Contributing' },
];

const SECTION: React.CSSProperties = { borderBottom: '1px solid var(--border)', paddingBottom: '2.5rem', marginBottom: '2.5rem', scrollMarginTop: '5rem' };
const H2: React.CSSProperties = { fontSize: '1.35rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.875rem', fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' };
const P: React.CSSProperties = { fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.75, marginBottom: '0.75rem' };

function TableRow({ cells, head }: { cells: string[]; head?: boolean }) {
  const Tag = head ? 'th' : 'td';
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      {cells.map((c, i) => (
        <Tag key={i} style={{
          padding: '0.6rem 0.875rem', fontSize: '0.83rem',
          color: head ? 'var(--text-faint)' : 'var(--text-muted)',
          fontWeight: head ? 700 : 400, textAlign: 'left',
          fontFamily: head ? 'var(--font-heading)' : 'var(--font-body)',
          letterSpacing: head ? '0.06em' : undefined,
          textTransform: head ? 'uppercase' : undefined,
        }}>{c}</Tag>
      ))}
    </tr>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sectionEls = NAV_ITEMS.map(n => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    observerRef.current = new IntersectionObserver(
      entries => {
        entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); });
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );
    sectionEls.forEach(el => observerRef.current!.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div>
      {/* Hero */}
      <section style={{ borderBottom: '1px solid var(--border)', padding: '4rem 0 3rem', background: 'var(--surface)' }}>
        <div className="container">
          <div className="badge" style={{ marginBottom: '1.25rem' }}>Documentation</div>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text)', marginBottom: '0.75rem', fontFamily: 'var(--font-heading)' }}>
            Chopsticks Docs
          </h1>
          <p style={{ fontSize: '1rem', color: 'var(--text-muted)', maxWidth: '520px', lineHeight: 1.7 }}>
            Use the hosted instance, reskin it to match your brand, or self-host your own. Everything you need is here.
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="container" style={{ padding: '3.5rem 1.5rem', display: 'grid', gridTemplateColumns: '200px 1fr', gap: '3rem', maxWidth: '1000px', alignItems: 'start' }}>

        {/* Sticky scrollspy sidebar */}
        <nav style={{ position: 'sticky', top: 72, display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '0.625rem', overflow: 'hidden' }}>
          {NAV_ITEMS.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`scrollspy-link${activeSection === item.id ? ' active' : ''}`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Content body */}
        <div>

          <section id="overview" style={SECTION}>
            <h2 style={H2}>Overview</h2>
            <p style={P}>Chopsticks is a full-featured Discord bot built on discord.js v14 with PostgreSQL persistence, Redis caching, and a Lavalink audio backend. It ships 101 slash commands across music, moderation, economy, games, AI, and social features.</p>
            <p style={P}>The flagship feature is the <strong style={{ color: 'var(--text)' }}>Agent Pool System</strong>: multiple Discord bot tokens are pooled, encrypted, and dispatched to voice channels on demand. Servers consume capacity without managing tokens.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.625rem', marginTop: '1.25rem' }}>
              {[['101', 'Commands'], ['49', 'Voice sessions'], ['MIT', 'License']].map(([v, l]) => (
                <div key={l} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.25rem', color: 'var(--accent)', letterSpacing: '-0.03em' }}>{v}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-faint)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '0.2rem' }}>{l}</div>
                </div>
              ))}
            </div>
          </section>

          <section id="hosted" style={SECTION}>
            <h2 style={H2}>Hosted quickstart</h2>
            <p style={P}>Add Chopsticks to your server — no hosting or coding required.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                ['1', 'Invite the bot', 'Use the OAuth2 invite link. Chopsticks requests only the permissions it needs.'],
                ['2', 'Run /setup', 'Initialises the database for your server — economy tables, mod log channel, welcome settings.'],
                ['3', 'Configure modules', 'Use /setup to configure moderation, economy, and agent-pool settings per your server.'],
                ['4', 'Test with /ping', 'Confirm the bot is responding. Then /help to see all commands grouped by category.'],
              ].map(([n, title, desc]) => (
                <div key={n} style={{ display: 'grid', gridTemplateColumns: '2rem 1fr', gap: '0.875rem', alignItems: 'start' }}>
                  <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', flexShrink: 0 }}>{n}</div>
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-heading)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>{title}</p>
                    <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="self-host" style={SECTION}>
            <h2 style={H2}>Self-hosting</h2>
            <p style={P}>Run your own instance with the full Docker stack. PostgreSQL, Redis, and Lavalink are all included.</p>
            <CodeBlock>{`git clone https://github.com/WokSpec/Chopsticks
cd Chopsticks
cp .env.example .env
# Fill in your bot token, client ID, and DB credentials
docker compose -f docker-compose.laptop.yml up -d
npm run deploy    # register slash commands with Discord`}</CodeBlock>
            <p style={P}>For production use, see <Ic>docker-compose.production.yml</Ic> which includes Caddy reverse proxy and hardened settings.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', background: 'var(--surface-raised)', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', fontSize: '0.83rem' }}>
              <thead><TableRow cells={['Variable', 'Required', 'Description']} head /></thead>
              <tbody>
                {[
                  ['DISCORD_TOKEN', 'Yes', 'Bot token from Discord Developer Portal'],
                  ['CLIENT_ID', 'Yes', 'Application client ID'],
                  ['DATABASE_URL', 'Yes', 'PostgreSQL connection string'],
                  ['REDIS_URL', 'Yes', 'Redis connection string (default: redis://localhost:6379)'],
                  ['LAVALINK_HOST', 'Yes', 'Lavalink server host'],
                  ['OPENAI_API_KEY', 'No', 'OpenAI key for AI features (users can BYOK)'],
                ].map(r => <TableRow key={r[0]} cells={r} />)}
              </tbody>
            </table>
          </section>

          <section id="reskin" style={SECTION}>
            <h2 style={H2}>Reskinning</h2>
            <p style={P}>Fork the repo, update the constants in <Ic>src/config/branding.ts</Ic>, and rebuild. You can change the bot name, avatar URL, embed color, footer text, and error message copy.</p>
            <CodeBlock>{`// src/config/branding.ts
export const BRANDING = {
  name:        'Your Bot Name',
  avatarUrl:   'https://cdn.yoursite.com/avatar.png',
  color:       0x38BDF8,          // hex as integer
  footer:      'Powered by YourBot',
  errorPrefix: '❌',
};`}</CodeBlock>
            <p style={P}>After updating branding, run <Ic>docker compose up --build -d</Ic> to apply changes.</p>
          </section>

          <section id="per-server" style={SECTION}>
            <h2 style={H2}>Per-server themes</h2>
            <p style={P}>Servers can customise the bot's appearance without forking, using the <Ic>/theme</Ic> command family:</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--surface-raised)', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', fontSize: '0.83rem' }}>
              <thead><TableRow cells={['Command', 'Effect']} head /></thead>
              <tbody>
                {[
                  ['/theme color #hex',    'Sets the embed accent color for this server'],
                  ['/theme name <name>',   "Renames the bot's persona in all embeds"],
                  ['/theme feature <mod>:off', 'Disables a module (music, economy, games, ai)'],
                  ['/theme view',          'Displays current theme settings'],
                ].map(r => <TableRow key={r[0]} cells={r} />)}
              </tbody>
            </table>
          </section>

          <section id="feature-flags" style={SECTION}>
            <h2 style={H2}>Feature flags</h2>
            <p style={P}>Module-level feature flags can be toggled per-server with <Ic>/theme feature</Ic> or globally in <Ic>.env</Ic> for self-hosters:</p>
            <CodeBlock>{`FEATURE_MUSIC=true
FEATURE_ECONOMY=true
FEATURE_GAMES=true
FEATURE_AI=true
FEATURE_AUTOMATION=true
FEATURE_AGENT_POOL=true`}</CodeBlock>
            <p style={P}>Setting any flag to <Ic>false</Ic> disables all commands in that module across the entire instance. Per-server flags override the global defaults.</p>
          </section>

          <section id="agent-pool" style={SECTION}>
            <h2 style={H2}>Agent Pool</h2>
            <p style={P}>The Agent Pool lets community members contribute bot tokens which are pooled and dispatched to voice channels on demand. Servers consume pool capacity via credits — they never manage tokens directly.</p>
            <p style={P}><strong style={{ color: 'var(--text)' }}>Architecture:</strong> tokens are encrypted at rest, assigned to pools by owners, and dispatched to server sessions. The dispatching logic ensures fair distribution and respects per-pool rate limits.</p>
            <CodeBlock>{`# Contributing a token to a pool
1. Create a Discord bot at discord.com/developers
2. Run /agents add_token in any server with Chopsticks
3. Your token is encrypted and added to a pool of your choice
4. Servers can now request your agent via /agent join`}</CodeBlock>
            <p style={P}>See the full <a href={GITHUB + '/blob/main/docs/AGENT_POOL.md'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Agent Pool guide</a> on GitHub for advanced configuration.</p>
          </section>

          <section id="contributing" style={{ scrollMarginTop: '5rem', paddingBottom: '1rem' }}>
            <h2 style={H2}>Contributing</h2>
            <p style={P}>Pull requests are welcome. For major changes, open an issue first to discuss the approach.</p>
            <CodeBlock>{`# Development setup
git clone https://github.com/WokSpec/Chopsticks
cd Chopsticks
npm install
cp .env.example .env
npm run dev`}</CodeBlock>
            <p style={P}>See <a href={GITHUB + '/blob/main/CONTRIBUTING.md'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: 3 }}>CONTRIBUTING.md</a> for code style, commit conventions, and the PR checklist.</p>
          </section>

        </div>
      </div>
    </div>
  );
}
