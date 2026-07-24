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
  { label: 'Reputation → 99', path: `${ROOT}.world.factions.get("${fid}").reputation`, value: '99' },
]);

// ── editable city row ─────────────────────────────────────────────────────
function TableRow({ city, onApplyTroops, onApplySoldiers }: {
  city: CityRow;
  onApplyTroops: (inf: number, arch: number, cav: number) => void;
  onApplySoldiers: (n: number) => void;
}) {
  const [i, setI] = useState(String(city.infantry));
  const [a, setA] = useState(String(city.archer));
  const [c, setC] = useState(String(city.cavalry));
  const [s, setS] = useState(String(city.soldiers));

  // Keep inputs in sync when city data refreshes (after a scan).
  useEffect(() => {
    setI(String(city.infantry));
    setA(String(city.archer));
    setC(String(city.cavalry));
    setS(String(city.soldiers));
  }, [city.infantry, city.archer, city.cavalry, city.soldiers]);

  const toN = (v: string) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };

  return (
    <tr key={city.id}>
      <td>{city.id}</td>
      <td>{(city.population / 1000).toFixed(1)}k</td>
      <td>{city.economy}</td>
      <td><input className="tb-inp" value={s} onChange={(e) => setS(e.target.value)} />
          <button className="tbl-btn" title="Set soldier pool" onClick={() => onApplySoldiers(toN(s))}>Set</button>
      </td>
      <td><input className="tb-inp" value={i} onChange={(e) => setI(e.target.value)} /></td>
      <td><input className="tb-inp" value={a} onChange={(e) => setA(e.target.value)} /></td>
      <td><input className="tb-inp" value={c} onChange={(e) => setC(e.target.value)} /></td>
      <td><button className="tbl-btn" onClick={() => onApplyTroops(toN(i), toN(a), toN(c))}>Set</button></td>
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

  // ── load faction list from smoke output ──────────────────────────────────
  const loadFactions = async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const sample = await bridge.runSmoke();
      const lines = sample.sampleHits || [];
      const out: FactionInfo[] = [];
      for (const line of lines) {
        const m = line.match(/world\.factions\.get\("([^"]+)"\)\s+name=(\S+)\s+leaderId=(\S+)\s+gold=([\-\d.]+)\s+food=([\-\d.]+)/);
        if (m) out.push({ id: m[1], gold: Number(m[4]), food: Number(m[5]) });
      }
      setFactions(out);
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
  // soldiers is an independent pool (total manpower), NOT infantry+archer+cavalry.
  // We do not auto-write soldiers here. If the table reads stale data, the user
  // can refresh via the Scan cities button after the next in-game turn settles.
  const applyTroops = async (cid: number, infantry: number, archer: number, cavalry: number) => {
    const base = `${ROOT}.world.cities.get(${cid})`;
    await doApply(`${base}.troops.infantry`, String(infantry));
    await doApply(`${base}.troops.archer`, String(archer));
    await doApply(`${base}.troops.cavalry`, String(cavalry));
  };

  // Bonus utility: set soldiers (manpower pool) directly without touching troops.
  const applySoldiers = async (cid: number, n: number) => {
    const base = `${ROOT}.world.cities.get(${cid})`;
    await doApply(`${base}.soldiers`, String(n));
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
            <div className="row">
              {FACTION_PRESETS(selectedFactionId).map((p) => (
                <button key={p.path} title={`${p.path} = ${p.value}`} onClick={() => doApply(p.path, p.value)}>{p.label}</button>
              ))}
            </div>
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
                <th>#</th><th>Pop</th><th>Econ</th><th>Soldiers [Set]</th>
                <th>Infantry</th><th>Archer</th><th>Cavalry</th>
                <th>Troops [Set]</th>
              </tr>
            </thead>
            <tbody>
              {playerCities.map((c) => (
                <TableRow
                  key={c.id}
                  city={c}
                  onApplyTroops={(inf, arch, cav) => applyTroops(c.id, inf, arch, cav)}
                  onApplySoldiers={(n) => applySoldiers(c.id, n)}
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
