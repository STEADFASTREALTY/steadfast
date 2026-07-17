import Link from "next/link";
import { connection } from "next/server";

const propertyTypes = ["House", "Apartment", "Townhouse", "Land", "Commercial"];

const platformHighlights = [
  {
    number: "01",
    title: "Listings that move with confidence",
    body: "A clear brokerage approval trail keeps every price, status, and major edit accountable.",
  },
  {
    number: "02",
    title: "Your brand, beautifully presented",
    body: "Agents and brokerages receive focused web experiences designed to make their inventory shine.",
  },
  {
    number: "03",
    title: "Built for trusted collaboration",
    body: "Share approved listings across agent websites while preserving ownership and contact choice.",
  },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21">
      <path d="M12 21s6-5.5 6-12a6 6 0 1 0-12 0c0 6.5 6 12 6 12Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="9" r="2.2" fill="currentColor" />
    </svg>
  );
}

export default async function Home() {
  await connection();

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="SteadFast Realty home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SteadFast</span>
          <small>Realty</small>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <Link href="/properties">Buy</Link>
          <Link href="/properties?intent=rent">Rent</Link>
          <a href="#platform">For professionals</a>
        </nav>
        <div className="header-actions">
          <span className="launch-note">Jamaica marketplace</span>
          <Link className="outline-button" href="/sign-in">Sign in</Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><i /> Built for Jamaica</span>
          <h1>Property,<br /><em>connected.</em></h1>
          <p className="hero-intro">
            A calmer, clearer way to discover property and work with trusted real estate professionals.
          </p>

          <form className="property-search" action="/properties" method="get">
            <label className="search-location">
              <span>Where are you looking?</span>
              <span className="search-input-row">
                <PinIcon />
                <input name="location" maxLength={80} placeholder="Kingston, Montego Bay, St. Ann..." />
              </span>
            </label>
            <label>
              <span>Property type</span>
              <select name="type" defaultValue="">
                <option value="">Any property</option>
                {propertyTypes.map((type) => <option key={type} value={type.toLowerCase()}>{type}</option>)}
              </select>
            </label>
            <button type="submit" aria-label="Search properties"><ArrowIcon /></button>
          </form>

          <div className="hero-footnote">
            <span>Verified brokerage workflow</span>
            <span>Agent-led service</span>
            <span>International-ready</span>
          </div>
        </div>

        <div className="island-panel" aria-label="Stylized map of Jamaica">
          <div className="map-grid" />
          <div className="map-label map-label-one"><i /> Kingston</div>
          <div className="map-label map-label-two"><i /> Montego Bay</div>
          <div className="map-label map-label-three"><i /> Ocho Rios</div>
          <div className="island-shape">
            <div className="island-glow" />
          </div>
          <div className="map-card">
            <span>From local reach</span>
            <strong>to global discovery.</strong>
            <p>Structured for international listing connections as SteadFast grows.</p>
          </div>
        </div>
      </section>

      <section className="platform-section" id="platform">
        <div className="section-heading">
          <span className="eyebrow dark"><i /> One connected platform</span>
          <h2>Real estate should feel<br />easy to move through.</h2>
          <p>SteadFast brings the work of agents and brokerages into one thoughtful, approval-led experience.</p>
        </div>
        <div className="highlight-grid">
          {platformHighlights.map((item) => (
            <article key={item.number}>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="roles-strip">
        <div>
          <span>For property seekers</span>
          <strong>Search simply. Choose your agent.</strong>
        </div>
        <div>
          <span>For agents</span>
          <strong>Present every listing at its best.</strong>
        </div>
        <div>
          <span>For brokerages</span>
          <strong>Lead your people and inventory.</strong>
        </div>
      </section>

      <footer>
        <Link className="brand footer-brand" href="/">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SteadFast</span>
        </Link>
        <p>Jamaica&apos;s modern real estate platform.</p>
        <span>Prototype release · 2026</span>
      </footer>
    </main>
  );
}
