import { useEffect, useState } from 'react';
import { bridge } from '../lib/bridge';

interface FactionInfo {
  id: string;
  gold: number | string;
  food: number | string;
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

const CITY_PRESETS = (cid: number) => ([
  { label: `City ${cid} soldiers → 99999`,   path: `${ROOT}.world.cities.get(${cid}).soldiers`,   value: '99999' },
  { label: `City ${cid} troops → 99999`,      path: `${ROOT}.world.cities.get(${cid}).troops`,     value: '99999' },
  { label: `City ${cid} economy → 9999`,      path: `${ROOT}.world.cities.get(${cid}).economy`,    value: '9999' },
  { label: `City ${cid} population → 999999`, path: `${ROOT}.world.cities.get(${cid}).population`,  value: '999999' },
  { label: `City ${cid} agriculture → 9999`,  path: `${ROOT}.world.cities.get(${cid}).agriculture`, value: '9999' },
]);

const ALL_CITY_IDS = Array.from({ length: 44 }, (_, i) => i + 1);

// ── component ──────────────────────────────────────────────────────────────
export function QuickPresets({ connected, selectedFactionId, onSelectFaction }: Props) {
  const [factions, setFactions] = useState<FactionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityId, setCityId] = useState(1);

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
        if (m) {
          out.push({ id: m[1], gold: Number(m[4]), food: Number(m[5]) });
        }
      }
      setFactions(out);
      if (out.length > 0 && !selectedFactionId) onSelectFaction(out[0].id);
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected && factions.length === 0 && !loading) loadFactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  if (!connected) return <div className="presets">Presets disabled: not connected to game.</div>;

  const doApply = async (path: string, value: string) => {
    const r = await window.trainer.apply({ path, value });
    if (!r.ok) setError(`apply failed: ${r.error}`);
  };

  return (
    <div className="presets">
      <div className="row">
        <button onClick={loadFactions} disabled={loading}>{loading ? 'Loading\u2026' : 'Refresh faction list'}</button>
        {error && <span className="err">{error}</span>}
      </div>

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

      <label className="faction-pick">
        City to modify
        <select value={cityId} onChange={(e) => setCityId(Number(e.target.value))}>
          {ALL_CITY_IDS.map((id) => (<option key={id} value={id}>City {id}</option>))}
        </select>
      </label>
      <div className="row">
        {CITY_PRESETS(cityId).map((p) => (
          <button key={p.path} title={`${p.path} = ${p.value}`} onClick={() => doApply(p.path, p.value)}>{p.label}</button>
        ))}
      </div>
    </div>
  );
}
