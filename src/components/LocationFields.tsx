import { useEffect, useMemo, useRef, useState } from 'react';

type CountryItem = { name: string; shortName: string };
type CountryRecord = { states?: Record<string, Array<{ name: string }>> };
type CountryService = {
  getCountries: () => CountryItem[];
  getStatesByShort: (shortName: string) => string[] | null;
  getCities: (shortName: string, state: string) => Promise<string[] | null>;
  getCountryByShort: (shortName: string) => Promise<CountryRecord | null>;
};

function useCountryData() {
  const [service, setService] = useState<CountryService | null>(null);
  useEffect(() => {
    let active = true;
    import('countrycitystatejson/client').then(module => {
      if (active) setService((module.default ?? module) as CountryService);
    }).catch(() => {
      if (active) setService(null);
    });
    return () => { active = false; };
  }, []);
  return service;
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

function SearchSelect({ label, value, options, onChange, disabled, required, onOpen, loading, emptyMessage }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
  disabled?: boolean; required?: boolean; onOpen?: () => void; loading?: boolean; emptyMessage?: string;
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
        placeholder={disabled ? 'Choose the previous location first' : loading ? 'Loading locations…' : `Search ${label.toLowerCase()}…`}
        disabled={disabled} required={required} autoComplete="off"
        onFocus={() => { setQuery(''); setOpen(true); onOpen?.(); }}
        onChange={event => { setQuery(event.target.value); setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
        aria-label={label} aria-expanded={open} role="combobox" aria-autocomplete="list"
      />
      <span className="location-chevron" aria-hidden="true">⌄</span>
      {open && !disabled && <div className="location-options" role="listbox">
        {loading ? <p>Loading location data…</p> : filtered.length ? filtered.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value}
          onMouseDown={event => event.preventDefault()}
          onClick={() => { onChange(option.value); setQuery(''); setOpen(false); }}>
          {option.label}{option.value === value ? ' ✓' : ''}
        </button>) : <p>{emptyMessage || 'No matches. Try another spelling.'}</p>}
      </div>}
    </div>
  </label>;
}

export default function LocationFields({ value, onChange, required = false }: Props) {
  const countryApi = useCountryData();
  const countryRows = useMemo(() => countryApi?.getCountries() ?? [], [countryApi]);
  const countries = useMemo<Option[]>(() => countryRows
    .map(country => ({ label: `${countryFlag(country.shortName)} ${country.name}`, value: country.name }))
    .sort((a, b) => a.label.localeCompare(b.label)), [countryRows]);
  const country = countryRows.find(item => item.name === value.country || item.shortName === value.country);
  const countryCode = country?.shortName || value.country;
  const stateNames = useMemo(() => value.country && countryApi
    ? countryApi.getStatesByShort(countryCode) ?? []
    : [], [value.country, countryCode, countryApi]);
  const states = useMemo<Option[]>(() => stateNames
    .map(name => ({ label: name, value: name }))
    .sort((a, b) => a.label.localeCompare(b.label)), [stateNames]);
  const hasStates = states.length > 0;
  const [cityOptions, setCityOptions] = useState<Option[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityError, setCityError] = useState('');
  const [loadedCityKey, setLoadedCityKey] = useState('');
  const cityRequestId = useRef(0);
  const cityKey = `${countryCode}:${value.state}`;

  useEffect(() => {
    cityRequestId.current += 1;
    setCityOptions([]);
    setCityLoading(false);
    setCityError('');
    setLoadedCityKey('');
  }, [cityKey]);

  const loadCityData = async () => {
    if (!countryApi || !countryCode || cityLoading || loadedCityKey === cityKey) return;
    const requestId = ++cityRequestId.current;
    setCityLoading(true);
    setCityError('');
    try {
      let names: string[] | null;
      if (hasStates && value.state) {
        names = await countryApi.getCities(countryCode, value.state);
      } else {
        const countryData = await countryApi.getCountryByShort(countryCode);
        names = countryData
          ? Object.values(countryData.states ?? {}).flat().map(city => city.name)
          : null;
      }
      if (cityRequestId.current !== requestId) return;
      if (names === null) throw new Error('This location is not available in the current dataset.');
      setCityOptions([...new Set(names.filter(Boolean))]
        .map(name => ({ label: name, value: name }))
        .sort((a, b) => a.label.localeCompare(b.label)));
      setLoadedCityKey(cityKey);
    } catch {
      if (cityRequestId.current === requestId) {
        setCityOptions([]);
        setCityError('Location list could not be loaded. Please try opening this field again.');
      }
    } finally {
      if (cityRequestId.current === requestId) setCityLoading(false);
    }
  };

  const update = (patch: Partial<LocationValue>) => onChange({ ...value, ...patch });
  return <div className="location-fields" aria-label="Location">
    <SearchSelect label="Country" value={value.country} options={countries} required={required}
      onChange={code => update({ country: code, state: '', city: '', area: '' })} />
    <SearchSelect label={country?.name && ['United States', 'Canada', 'Australia', 'India', 'Brazil', 'Mexico'].includes(country.name) ? 'State / province' : 'State / region'}
      value={value.state} options={states} disabled={!value.country || !countryApi || !hasStates} required={required && hasStates}
      onChange={code => update({ state: code, city: '', area: '' })} />
    <SearchSelect label="Area / Local Government" value={value.area || value.city} options={cityOptions}
      disabled={!value.country || !countryApi} loading={cityLoading}
      emptyMessage={cityError || 'No areas are listed for this location.'}
      onOpen={() => void loadCityData()} required={required}
      onChange={area => update({ area, city: area })} />
    {value.country && countryApi && !hasStates && <p className="location-hint">This country’s location dataset does not list states or provinces; you can still select an area.</p>}
    {cityError && <p className="location-hint">{cityError}</p>}
    <p className="location-hint">Start typing to search, then select a result. Location fields are selections, not free-text entries.</p>
  </div>;
}

export function CountryDropdown({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const countryApi = useCountryData();
  const countries = useMemo<Option[]>(() => (countryApi?.getCountries() ?? [])
    .map(country => ({ label: `${countryFlag(country.shortName)} ${country.name}`, value: country.name }))
    .sort((a, b) => a.label.localeCompare(b.label)), [countryApi]);
  return <SearchSelect label="Country restriction (optional)" value={value} options={countries}
    disabled={!countryApi} onChange={onChange} />;
}
