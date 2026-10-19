import { useEffect, useMemo, useState } from 'react';

type CountryItem = { name: string; isoCode: string };
type StateItem = { name: string; isoCode: string };
type CityItem = { name: string };
type CountryService = { getAllCountries: () => CountryItem[] };
type StateService = { getStatesOfCountry: (countryCode: string) => StateItem[] };
type CityService = {
  getCitiesOfState: (countryCode: string, stateCode: string) => CityItem[];
  getCitiesOfCountry: (countryCode: string) => CityItem[];
};

function useCountryData() {
  const [service, setService] = useState<CountryService | null>(null);
  useEffect(() => {
    let active = true;
    import('country-state-city/lib/country').then(module => {
      if (active) setService(module.Country as CountryService);
    }).catch(() => {
      if (active) setService(null);
    });
    return () => { active = false; };
  }, []);
  return service;
}

function useStateData(countryCode: string) {
  const [service, setService] = useState<StateService | null>(null);
  useEffect(() => {
    if (!countryCode || service) return;
    let active = true;
    import('country-state-city/lib/state').then(module => {
      if (active) setService(module.State as StateService);
    }).catch(() => {
      if (active) setService(null);
    });
    return () => { active = false; };
  }, [countryCode, service]);
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

function SearchSelect({ label, value, options, onChange, disabled, required, onOpen, loading }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
  disabled?: boolean; required?: boolean; onOpen?: () => void; loading?: boolean;
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
        </button>) : <p>No matches. Try another spelling.</p>}
      </div>}
    </div>
  </label>;
}

export default function LocationFields({ value, onChange, required = false }: Props) {
  const countryApi = useCountryData();
  const countryRows = useMemo(() => countryApi?.getAllCountries() ?? [], [countryApi]);
  const countries = useMemo<Option[]>(() => countryRows
    .map(country => ({ label: `${countryFlag(country.isoCode)} ${country.name}`, value: country.name }))
    .sort((a, b) => a.label.localeCompare(b.label)), [countryRows]);
  const country = countryRows.find(item => item.name === value.country || item.isoCode === value.country);
  const countryCode = country?.isoCode || value.country;
  const stateApi = useStateData(countryCode);
  const states = useMemo<Option[]>(() => value.country && stateApi
    ? stateApi.getStatesOfCountry(countryCode).map(state => ({ label: state.name, value: state.name })).sort((a,b) => a.label.localeCompare(b.label))
    : [], [value.country, countryCode, stateApi]);
  const [cityApi, setCityApi] = useState<CityService | null>(null);
  const [cityLoading, setCityLoading] = useState(false);
  const loadCityData = () => {
    if (cityApi || cityLoading) return;
    setCityLoading(true);
    import('country-state-city/lib/city').then(module => {
      setCityApi(module.City as CityService);
    }).catch(() => {
      setCityApi(null);
    }).finally(() => setCityLoading(false));
  };
  const cities = useMemo<Option[]>(() => {
    if (!value.country || !cityApi) return [];
    const selectedState = stateApi?.getStatesOfCountry(countryCode).find(item => item.name === value.state || item.isoCode === value.state);
    const rows = selectedState
      ? cityApi.getCitiesOfState(countryCode, selectedState.isoCode)
      : cityApi.getCitiesOfCountry(countryCode) || [];
    return [...new Set(rows.map(city => city.name))].map(name => ({ label: name, value: name })).sort((a,b) => a.label.localeCompare(b.label));
  }, [value.country, value.state, countryCode, stateApi, cityApi]);
  const hasStates = states.length > 0;
  const update = (patch: Partial<LocationValue>) => onChange({ ...value, ...patch });
  return <div className="location-fields" aria-label="Location">
    <SearchSelect label="Country" value={value.country} options={countries} required={required}
      onChange={code => update({ country: code, state: '', city: '', area: '' })} />
    <SearchSelect label={country?.name && ['United States','Canada','Australia','India','Brazil','Mexico'].includes(country.name) ? 'State / province' : 'State / region'}
      value={value.state} options={states} disabled={!value.country || !stateApi || !hasStates} required={required && hasStates}
      onChange={code => update({ state: code, city: '', area: '' })} />
    <SearchSelect label="Area / Local Government" value={value.area || value.city} options={cities}
      disabled={!value.country} loading={cityLoading || (Boolean(value.country) && !cityApi)}
      onOpen={loadCityData} required={required} onChange={area => update({ area, city: area })} />
    {value.country && stateApi && !hasStates && <p className="location-hint">This country’s location dataset does not list states or provinces; you can still select an area.</p>}
    <p className="location-hint">Start typing to search, then select a result. Location fields are selections, not free-text entries.</p>
  </div>;
}

export function CountryDropdown({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const countryApi = useCountryData();
  const countries = useMemo<Option[]>(() => (countryApi?.getAllCountries() ?? [])
    .map(country => ({ label: `${countryFlag(country.isoCode)} ${country.name}`, value: country.name }))
    .sort((a, b) => a.label.localeCompare(b.label)), [countryApi]);
  return <SearchSelect label="Country restriction (optional)" value={value} options={countries}
    disabled={!countryApi} onChange={onChange} />;
}
