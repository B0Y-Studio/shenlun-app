import { useEffect, useState } from 'react';
import { bridge } from '../lib/bridge';

interface FactionInfo {
  id: string;
  name: string;
  leaderId: string;
  gold: number | string;
  food: number | string;
  reputation: number | string;
}

interface Props {
  connected: boolean;
  selectedFactionId: string | null;
  onSelectFaction: (id: string) => void;
}

// Quick presets: each entry is a button that, on click, runs the equivalent
// of "type this path / value into the editor + Apply". We avoid polluting
// the path-editor state by emitting through the same apply channel as a
// manually typed path, but using the faction id from the picker.

const PRESETS = (factionId: string) => ([
  { label: 'Gold → 999999', path: `EconomyEngine.getInstance().world.factions.get("${factionId}").gold`, value: '999999' },
  { label: 'Food → 99999', path: `EconomyEngine.getInstance().world.factions.get("${factionId}").food`, value: '99999' },
  { label: 'Reputation → 99', path: `EconomyEngine.getInstance().world.factions.get("${factionId}").reputation`, value: '99' },
  { label: 'City 1 gold → 9999', path: `EconomyEngine.getInstance().world.cities.get("1").economy`, value: '9999' },
  { label: 'City 1 soldiers → 99999', path: `EconomyEngine.getInstance().world.cities.get("1").soldiers`, value: '99999' },
]);

export function QuickPresets({ connected, selectedFactionId, onSelectFaction }: Props) {
  const [factions, setFactions] = useState<FactionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFactions = async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      // Probe: get every faction id + name + gold + food + reputation.
      // We do this via a single Runtime.evaluate on the page side; the
      // prefab uses the trainer's pre-existing helpers so path parsing
      // is not involved here.
      const r = await window.trainer.runSmoke();
      // runSmoke returns { roots, sampleHits }; SampleHits are strings.
      // Not ideal for this lookup \u2014 instead we issue a custom one-shot
      // eval through a tiny new bridge method.
      void r;
      // Fallback: we don't have a "listFactions" method, so instead we
      // re-use inspect() by walking each candidate id from the smoke output.
      // The smoke output includes lines like
      //   world.factions.get("FACTION_1037")  name=FACTION_1037  leaderId=1037  gold=16258.5  food=766
      const sample = await bridge.runSmoke();
      const lines = sample.sampleHits || [];
      const out: FactionInfo[] = [];
      for (const line of lines) {
        const m = line.match(/world\.factions\.get\("([^"]+)"\)\s+name=(\S+)\s+leaderId=(\S+)\s+gold=([\-\d.]+)\s+food=([\-\d.]+)/);
        if (m) {
          out.push({
            id: m[1],
            name: m[2],
            leaderId: m[3],
            gold: Number(m[4]),
            food: Number(m[5]),
            reputation: 0, // sampleHits doesn't include reputation \u2014 leave at 0
          });
        }
      }
      setFactions(out);
      if (out.length > 0 && !selectedFactionId) {
        // Default-pick the smallest faction.id \u2014 deterministic but the
        // user can override.
        onSelectFaction(out[0].id);
      }
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected && factions.length === 0 && !loading) {
      loadFactions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  if (!connected) {
    return <div className="presets">Presets disabled: not connected to game.</div>;
  }

  return (
    <div className="presets">
      <div className="row">
        <button onClick={loadFactions} disabled={loading}>{loading ? 'Loading\u2026' : 'Refresh faction list'}</button>
        {error && <span className="err">{error}</span>}
      </div>
      {factions.length > 0 && (
        <>
          <label className="faction-pick">
            Player faction
            <select
              value={selectedFactionId ?? ''}
              onChange={(e) => onSelectFaction(e.target.value)}
            >
              {factions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id}  gold={String(f.gold)}  food={String(f.food)}
                </option>
              ))}
            </select>
          </label>
          {selectedFactionId && (
            <div className="row">
              {PRESETS(selectedFactionId).map((p) => (
                <button
                  key={p.path}
                  title={`${p.path} = ${p.value}`}
                  // The actual apply happens through the in-page IPC bridge.
                  // We invoke window.trainer.apply directly so the path does
                  // not pollute the editor field; this keeps the user able
                  // to see the typed path afterwards.
                  onClick={async () => {
                    const r = await window.trainer.apply({
                      path: p.path,
                      value: p.value,
                    });
                    if (!r.ok) {
                      setError(`apply failed: ${r.error}`);
                    }
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
