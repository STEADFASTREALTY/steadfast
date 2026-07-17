const locations = ["Black River", "Comfort Hall", "Discovery Bay", "Falmouth", "Kingston", "Lucea", "Mandeville", "Montego Bay", "Morant Bay", "Negril", "Ocho Rios", "Port Antonio", "Red Hills", "Richmond", "Savanna-la-Mar", "Spanish Town"];
const propertyTypes = ["House", "Apartment", "Townhouse", "Land", "Commercial", "Development"];
const priceOptions = [0, 1_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000];
const sizeOptions = [500, 1_000, 1_500, 2_000, 3_000, 5_000, 10_000, 20_000];

function ArrowIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>; }
function PinIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21"><path d="M12 21s6-5.5 6-12a6 6 0 1 0-12 0c0 6.5 6 12 6 12Z" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="9" r="2.2" fill="currentColor" /></svg>; }

function compactJmd(amount: number) { return `J$${new Intl.NumberFormat("en-JM", { maximumFractionDigits: 0, notation: "compact" }).format(amount)}`; }

export function PropertySearchCard({ hiddenFields = {}, locationOptions = locations }: { hiddenFields?: Record<string, string>; locationOptions?: string[] }) {
  const cityOptions = Array.from(new Set([...locations, ...locationOptions])).sort((a, b) => a.localeCompare(b, "en-JM", { sensitivity: "base" }));
  return <form className="property-search property-search-full" action="/properties" method="get">
    {Object.entries(hiddenFields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <label className="search-location"><span>Where are you looking?</span><span className="search-input-row"><PinIcon /><select name="location" defaultValue=""><option value="">Any city or area</option>{cityOptions.map((location) => <option key={location} value={location}>{location}</option>)}</select></span></label>
    <label><span>Use</span><select name="category" defaultValue=""><option value="">Any use</option><option value="residential">Residential</option><option value="commercial">Commercial</option></select></label>
    <label><span>Property type</span><select name="type" defaultValue=""><option value="">Any property</option>{propertyTypes.map((type) => <option key={type} value={type.toLowerCase()}>{type}</option>)}</select></label>
    <label><span>Min price</span><select name="minPrice" defaultValue="0">{priceOptions.map((amount) => <option key={amount} value={amount}>{amount === 0 ? "J$0" : amount === 500_000_000 ? "J$500M+" : compactJmd(amount)}</option>)}</select></label>
    <label><span>Max price</span><select name="maxPrice" defaultValue="500000000+">{priceOptions.slice(1, -1).map((amount) => <option key={amount} value={amount}>{compactJmd(amount)}</option>)}<option value="500000000+">J$500M+</option></select></label>
    <label><span>Bedrooms</span><select name="beds" defaultValue=""><option value="">Any</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select></label>
    <label><span>Min building size</span><select name="minSize" defaultValue=""><option value="">Any sq ft</option>{sizeOptions.map((size) => <option key={size} value={size}>{new Intl.NumberFormat("en-JM").format(size)}</option>)}</select></label>
    <label><span>Max building size</span><select name="maxSize" defaultValue=""><option value="">Any sq ft</option>{sizeOptions.map((size) => <option key={size} value={size}>{new Intl.NumberFormat("en-JM").format(size)}</option>)}</select></label>
    <button type="submit"><span>Search</span><ArrowIcon /></button>
  </form>;
}
