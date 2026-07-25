import { useEffect, useState } from 'react';
import { bridge } from '../lib/bridge';

interface FactionInfo {
  id: string;
  gold: number | string;
  food: number | string;
}

interface CityRow {
  id: number;
  owner: string;
  soldiers: number;
  economy: number;
  agriculture: number;
  population: number;
  publicOrder: number;
  infantry: number;
  archer: number;
  cavalry: number;
}

interface Props {
  connected: boolean;
  selectedFactionId: string | null;
  onSelectFaction: (id: string) => void;
}

// ── helpers ────────────────────────────────────────────────────────────────
const ROOT = 'EconomyEngine.getInstance()';
const FACTION_PRESETS = (fid: string) => ([
  { label: 'Gold → 999999', path: `${ROOT}.world.factions.get("${fid}").gold`, value: '999999' },
  { label: 'Food → 99999',  path: `${ROOT}.world.factions.get("${fid}").food`, value: '99999' },
]);

// ── editable city row ─────────────────────────────────────────────────────
function TableRow({ city, onApply }: {
  city: CityRow;
  onApply: (inf: number, arch: number, cav: number) => void;
}) {
  const [i, setI] = useState(String(city.infantry));
  const [a, setA] = useState(String(city.archer));
  const [c, setC] = useState(String(city.cavalry));

  // Keep inputs in sync when city data refreshes.
  useEffect(() => {
    setI(String(city.infantry));
    setA(String(city.archer));
    setC(String(city.cavalry));
  }, [city.infantry, city.archer, city.cavalry]);

  const toN = (v: string) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };

  return (
    <tr key={city.id}>
      <td>{city.id}</td>
      <td>{(city.population / 1000).toFixed(1)}k</td>
      <td>{city.economy}</td>
      <td>{city.soldiers}</td>
      <td><input className="tb-inp" value={i} onChange={(e) => setI(e.target.value)} /></td>
      <td><input className="tb-inp" value={a} onChange={(e) => setA(e.target.value)} /></td>
      <td><input className="tb-inp" value={c} onChange={(e) => setC(e.target.value)} /></td>
      <td><button className="tbl-btn" onClick={() => onApply(toN(i), toN(a), toN(c))}>Set</button></td>
    </tr>
  );
}

// ── component ──────────────────────────────────────────────────────────────
export function QuickPresets({ connected, selectedFactionId, onSelectFaction }: Props) {
  const [factions, setFactions] = useState<FactionInfo[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── load faction list via dedicated CDP one-shot ─────────────────────────
  const loadFactions = async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const r = await bridge.scanFactions();
      if (!r.ok) { setError(r.error ?? 'scan failed'); return; }
      const out = (r.factions ?? []) as FactionInfo[];
      out.sort((a, b) => a.gold < b.gold ? 1 : -1); // richest first — usually player
      setFactions(out);
      // Auto-select the one whose leaderId is the player's own officer id
      // If we don't know that, just pick the first (richest)
      if (out.length > 0 && !selectedFactionId) onSelectFaction(out[0].id);
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  // ── scan all cities via CDP one-shot ────────────────────────────────────
  const scanCities = async () => {
    if (!connected) return;
    setCityLoading(true);
    setError(null);
    try {
      const r = await bridge.scanCities();
      if (!r.ok) { setError(r.error ?? 'scan failed'); return; }
      const all = (r.cities ?? []) as CityRow[];
      // Sort by id
      all.sort((a, b) => a.id - b.id);
      setCities(all);
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setCityLoading(false);
    }
  };

  useEffect(() => {
    if (connected && factions.length === 0 && !loading) loadFactions();
    if (connected && cities.length === 0 && !cityLoading) scanCities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // ── apply a preset ───────────────────────────────────────────────────────
  const doApply = async (path: string, value: string) => {
    const r = await window.trainer.apply({ path, value });
    if (!r.ok) setError(`apply failed: ${r.error}`);
    else scanCities(); // refresh after successful apply
  };

  // ── apply per-troop-type ─────────────────────────────────────────────────
  // soldiers is the SUM of infantry + archer + cavalry, not a separate pool.
  // We auto-set it whenever the user applies troop changes.
  const applyTroops = async (cid: number, infantry: number, archer: number, cavalry: number) => {
    const base = `${ROOT}.world.cities.get(${cid})`;
    await doApply(`${base}.troops.infantry`, String(infantry));
    await doApply(`${base}.troops.archer`, String(archer));
    await doApply(`${base}.troops.cavalry`, String(cavalry));
    await doApply(`${base}.soldiers`, String(infantry + archer + cavalry));
  };

  // ── filtered views ──────────────────────────────────────────────────────
  const playerCities = cities.filter((c) => c.owner === selectedFactionId);
  const enemyCities = cities.filter((c) => c.owner !== selectedFactionId);

  if (!connected) return <div className="presets">Presets disabled: not connected to game.</div>;

  return (
    <div className="presets">
      <div className="row">
        <button onClick={loadFactions} disabled={loading}>
          {loading ? 'Loading\u2026' : 'Refresh faction list'}
        </button>
        <button onClick={scanCities} disabled={cityLoading}>
          {cityLoading ? 'Scanning\u2026' : `Scan cities${cities.length > 0 ? ` (${cities.length})` : ''}`}
        </button>
        {error && <span className="err">{error}</span>}
      </div>

      {/* ── faction presets ─────────────────────────────────────────────── */}
      {factions.length > 0 && (
        <>
          <label className="faction-pick">
            Faction to modify
            <select value={selectedFactionId ?? ''} onChange={(e) => onSelectFaction(e.target.value)}>
              {factions.map((f) => (
                <option key={f.id} value={f.id}>{f.id}  gold={String(f.gold)}  food={String(f.food)}</option>
              ))}
            </select>
          </label>
          {selectedFactionId && (
            <>
              <div className="row">
                {FACTION_PRESETS(selectedFactionId).map((p) => (
                  <button key={p.path} title={`${p.path} = ${p.value}`} onClick={() => doApply(p.path, p.value)}>{p.label}</button>
                ))}
              </div>
              <div className="row">
                <button
                  title="Sets all officers in this faction to reputation 100 (max). Faction reputation is average of all officer reputations."
                  onClick={async () => {
                    const r = await bridge.setAllOfficerRep({ factionId: selectedFactionId, value: 100 });
                    if (!r.ok) { setError(r.error ?? 'apply failed'); }
                    else { setError(`Set ${r.total} officers to rep 100. Faction rep now: ${r.newFacRep}`); scanCities(); }
                  }}
                >Reputation (all officers → 100)</button>
              </div>
            </>
          )}
        </>
      )}

      {/* ── player cities table ─────────────────────────────────────────── */}
      {playerCities.length > 0 && (
        <div className="city-table-wrap">
          <div className="city-table-title">Your cities ({playerCities.length})</div>
          <table className="city-table">
            <thead>
              <tr>
                <th>#</th><th>Pop</th><th>Econ</th><th>Soldiers</th>
                <th>Infantry</th><th>Archer</th><th>Cavalry</th>
                <th>Set</th>
              </tr>
            </thead>
            <tbody>
              {playerCities.map((c) => (
                <TableRow
                  key={c.id}
                  city={c}
                  onApply={(inf, arch, cav) => applyTroops(c.id, inf, arch, cav)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── enemy cities ────────────────────────────────────────────────── */}
      {enemyCities.length > 0 && (
        <div className="city-table-wrap">
          <div className="city-table-title">Other cities ({enemyCities.length})</div>
          <table className="city-table mini">
            <thead>
              <tr><th>#</th><th>Owner</th><th>Soldiers</th></tr>
            </thead>
            <tbody>
              {enemyCities.slice(0, 10).map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.owner}</td>
                  <td>{c.soldiers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
