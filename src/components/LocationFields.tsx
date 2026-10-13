import { useMemo, useState } from 'react';
import { City, Country, State } from 'country-state-city';

export type LocationValue = { country: string; state: string; city: string; area: string };
type Props = {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  prefix?: string;
  required?: boolean;
  compact?: boolean;
};

type Option = { label: string; value: string };

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
  const countries = useMemo<Option[]>(() => Country.getAllCountries()
    .map(country => ({ label: country.name, value: country.isoCode }))
    .sort((a, b) => a.label.localeCompare(b.label)), []);
  const country = Country.getCountryByCode(value.country);
  const states = useMemo<Option[]>(() => value.country
    ? State.getStatesOfCountry(value.country).map(state => ({ label: state.name, value: state.isoCode })).sort((a,b) => a.label.localeCompare(b.label))
    : [], [value.country]);
  const cities = useMemo<Option[]>(() => {
    if (!value.country) return [];
    const rows = value.state
      ? City.getCitiesOfState(value.country, value.state)
      : City.getCitiesOfCountry(value.country) || [];
    return [...new Set(rows.map(city => city.name))].map(name => ({ label: name, value: name })).sort((a,b) => a.label.localeCompare(b.label));
  }, [value.country, value.state]);
  const areaOptions = cities;
  const hasStates = states.length > 0;
  const update = (patch: Partial<LocationValue>) => onChange({ ...value, ...patch });
  return <div className="location-fields" aria-label="Location">
    <SearchSelect label="Country" value={value.country} options={countries} required={required}
      onChange={code => update({ country: code, state: '', city: '', area: '' })} />
    <SearchSelect label={country?.name && ['US','CA','AU','IN','BR','MX'].includes(value.country) ? 'State / province' : 'State / region'}
      value={value.state} options={states} disabled={!value.country || !hasStates}
      onChange={code => update({ state: code, city: '', area: '' })} />
    <SearchSelect label="City" value={value.city} options={cities} disabled={!value.country}
      onChange={city => update({ city, area: '' })} />
    <SearchSelect label="Area / neighbourhood" value={value.area} options={areaOptions}
      disabled={!value.country} onChange={area => update({ area })} />
    {!hasStates && value.country && <p className="location-hint">This country’s location dataset does not list states or provinces; you can still select a city and area.</p>}
    <p className="location-hint">Start typing to search, then select a result. Location fields are selections, not free-text entries.</p>
  </div>;
}
