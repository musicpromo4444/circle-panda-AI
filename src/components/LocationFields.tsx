import { useEffect, useMemo, useState } from 'react';

type GeoModule = typeof import('country-state-city');

function useGeoData() {
  const [geo, setGeo] = useState<GeoModule | null>(null);
  useEffect(() => {
    let active = true;
    import('country-state-city').then(module => {
      if (active) setGeo(module);
    }).catch(() => {
      if (active) setGeo(null);
    });
    return () => { active = false; };
  }, []);
  return geo;
}

export type LocationValue = { country: string; state: string; city: string; area: string };
type Props = {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  prefix?: string;
  required?: boolean;
  compact?: boolean;
};

type Option = { label: string; value: string };

function countryFlag(isoCode: string) {
  return [...isoCode.toUpperCase()].map(char => String.fromCodePoint(127397 + char.charCodeAt(0))).join('');
}

function SearchSelect({ label, value, options, onChange, disabled, required }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
  disabled?: boolean; required?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q ? options.filter(option => option.label.toLocaleLowerCase().includes(q)).slice(0, 120) : options.slice(0, 120);
  }, [options, query]);
  const selected = options.find(option => option.value === value)?.label || '';
  return <label className="location-field">
    <span>{label}</span>
    <div className={`location-select-wrap${disabled ? ' is-disabled' : ''}`}>
      <input
        type="text" value={open ? query : selected}
        placeholder={disabled ? 'Choose the previous location first' : `Search ${label.toLowerCase()}…`}
        disabled={disabled} required={required} autoComplete="off"
        onFocus={() => { setQuery(''); setOpen(true); }}
        onChange={event => { setQuery(event.target.value); setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
        aria-label={label} aria-expanded={open} role="combobox" aria-autocomplete="list"
      />
      <span className="location-chevron" aria-hidden="true">⌄</span>
      {open && !disabled && <div className="location-options" role="listbox">
        {filtered.length ? filtered.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value}
          onMouseDown={event => event.preventDefault()}
          onClick={() => { onChange(option.value); setQuery(''); setOpen(false); }}>
          {option.label}{option.value === value ? ' ✓' : ''}
        </button>) : <p>No matches. Try another spelling.</p>}
      </div>}
    </div>
  </label>;
}

export default function LocationFields({ value, onChange, required = false }: Props) {
  const geo = useGeoData();
  const countries = useMemo<Option[]>(() => (geo?.Country.getAllCountries() ?? [])
    .map(country => ({ label: `${countryFlag(country.isoCode)} ${country.name}`, value: country.name }))
    .sort((a, b) => a.label.localeCompare(b.label)), [geo]);
  const country = (geo?.Country.getAllCountries() ?? []).find(item => item.name === value.country || item.isoCode === value.country);
  const states = useMemo<Option[]>(() => value.country && geo
    ? geo.State.getStatesOfCountry(country?.isoCode || value.country).map(state => ({ label: state.name, value: state.name })).sort((a,b) => a.label.localeCompare(b.label))
    : [], [value.country, country?.isoCode, geo]);
  const cities = useMemo<Option[]>(() => {
    if (!value.country || !geo) return [];
    const countryCode = country?.isoCode || value.country;
    const selectedState = geo.State.getStatesOfCountry(countryCode).find(item => item.name === value.state || item.isoCode === value.state);
    const rows = selectedState
      ? geo.City.getCitiesOfState(countryCode, selectedState.isoCode)
      : geo.City.getCitiesOfCountry(countryCode) || [];
    return [...new Set(rows.map(city => city.name))].map(name => ({ label: name, value: name })).sort((a,b) => a.label.localeCompare(b.label));
  }, [value.country, value.state, country?.isoCode, geo]);
  const areaOptions = cities;
  const hasStates = states.length > 0;
  const update = (patch: Partial<LocationValue>) => onChange({ ...value, ...patch });
  return <div className="location-fields" aria-label="Location">
    <SearchSelect label="Country" value={value.country} options={countries} required={required}
      onChange={code => update({ country: code, state: '', city: '', area: '' })} />
    <SearchSelect label={country?.name && ['United States','Canada','Australia','India','Brazil','Mexico'].includes(country?.name || value.country) ? 'State / province' : 'State / region'}
      value={value.state} options={states} disabled={!value.country || !hasStates}
      onChange={code => update({ state: code, city: '', area: '' })} />
    <SearchSelect label="City" value={value.city} options={cities} disabled={!value.country}
      onChange={city => update({ city, area: '' })} />
    <SearchSelect label="Area / neighbourhood (listed locality)" value={value.area} options={areaOptions}
      disabled={!value.country} onChange={area => update({ area })} />
    {!hasStates && value.country && <p className="location-hint">This country’s location dataset does not list states or provinces; you can still select a city and area.</p>}
    <p className="location-hint">Start typing to search, then select a result. Location fields are selections, not free-text entries.</p>
  </div>;
}

export function CountryDropdown({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const geo = useGeoData();
  const countries = useMemo<Option[]>(() => (geo?.Country.getAllCountries() ?? [])
    .map(country => ({ label: `${countryFlag(country.isoCode)} ${country.name}`, value: country.name }))
    .sort((a, b) => a.label.localeCompare(b.label)), [geo]);
  return <SearchSelect label="Country restriction (optional)" value={value} options={countries}
    onChange={onChange} />;
}
