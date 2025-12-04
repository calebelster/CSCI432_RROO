import React, { useEffect, useState } from 'react';
import { updateCommitteeSettings } from '../firebase/committees';
import { db } from '../firebase/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';

export default function CommitteeSettings({ committeeId, currentSettings = {}, onUpdated }) {
    const [settings, setSettings] = useState({
        requireSecond: true,
        allowAnonymousVoting: false,
        defaultVoteThreshold: 'Simple Majority',
        ...currentSettings,
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        setSettings(s => ({ ...s, ...currentSettings }));
    }, [currentSettings]);

    async function handleSave() {
        setSaving(true);
        try {
            await updateCommitteeSettings(committeeId, settings);
            setMessage({ text: 'Settings saved', type: 'success' });
            onUpdated && onUpdated(settings);
        } catch (err) {
            console.error('Failed to save settings', err);
            setMessage({ text: err.message || 'Save failed', type: 'error' });
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(null), 3000);
        }
    }

    async function exportCommitteeJSON() {
        try {
            const committeeRef = doc(db, 'committees', committeeId);
            const committeeSnap = await getDoc(committeeRef);
            const membersSnap = await getDocs(collection(db, 'committees', committeeId, 'members'));
            const motionsSnap = await getDocs(collection(db, 'committees', committeeId, 'motions'));
            const decisionsSnap = await getDocs(collection(db, 'committees', committeeId, 'decisions'));

            const payload = {
                committee: committeeSnap.exists() ? committeeSnap.data() : null,
                members: membersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                motions: motionsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                decisions: decisionsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                exportedAt: new Date().toISOString(),
            };

            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${committeeId}-export.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Export failed', e);
            setMessage({ text: e.message || 'Export failed', type: 'error' });
            setTimeout(() => setMessage(null), 3000);
        }
    }

    return (
        <div className="settings-card card">
            <h3>Committee Settings</h3>

            {/* Offline mode control removed as requested */}

            {/* Minimum speakers before vote removed */}

            <div className="form-row">
                <label className="form-label">Require a second for motions</label>
                <label className="switch-inline">
                    <input
                        type="checkbox"
                        checked={!!settings.requireSecond}
                        onChange={e => setSettings({ ...settings, requireSecond: e.target.checked })}
                    />
                    <span className="switch-slider-small" />
                </label>
            </div>

            <div className="form-row">
                <label className="form-label">Allow anonymous voting</label>
                <label className="switch-inline">
                    <input
                        type="checkbox"
                        checked={!!settings.allowAnonymousVoting}
                        onChange={e => setSettings({ ...settings, allowAnonymousVoting: e.target.checked })}
                    />
                    <span className="switch-slider-small" />
                </label>
            </div>

            <div className="form-row">
                <label className="form-label">Default vote threshold</label>
                <select
                    value={settings.defaultVoteThreshold}
                    onChange={e => setSettings({ ...settings, defaultVoteThreshold: e.target.value })}
                >
                    <option>Simple Majority</option>
                    <option>Two-Thirds</option>
                    <option>Unanimous</option>
                </select>
            </div>

            <div style={{ marginTop: 12 }} className="form-row">
                <button onClick={handleSave} disabled={saving} className="modal-create">
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
                <button onClick={exportCommitteeJSON} style={{ marginLeft: 8 }} className="modal-cancel">
                    Export JSON
                </button>
                {message && <span style={{ marginLeft: 12 }} className={message.type}>{message.text}</span>}
            </div>
        </div>
    );
}
