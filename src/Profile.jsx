import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Profile.css';
import { auth } from './firebase/firebase';
import { updateProfile } from 'firebase/auth';

export default function Profile({ currentUser }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // joined timestamp removed for now
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(false);

  // track original values so we can match members to update
  const [origName, setOrigName] = useState('');
  const [origEmail, setOrigEmail] = useState('');

  useEffect(() => {
    // prefer auth data if available, otherwise use persisted homeData
    try {
      if (currentUser) {
        setName(currentUser.displayName || '');
        setEmail(currentUser.email || '');
      }
      const raw = localStorage.getItem('homeData');
      if (raw) {
        const parsed = JSON.parse(raw);
        const p = parsed.profile || {};
        if (p.name) setName(p.name);
        if (p.email) setEmail(p.email);
        setOrigName(p.name || (currentUser && currentUser.displayName) || '');
        setOrigEmail(p.email || (currentUser && currentUser.email) || '');
      } else {
        setOrigName(currentUser?.displayName || '');
        setOrigEmail(currentUser?.email || '');
      }
    } catch (err) {
      // ignore
    }
  }, [currentUser]);

  async function handleSave(e) {
    e.preventDefault();
    setStatus('Saving...');
    try {
      // try to update firebase profile where possible
      try {
        if (auth.currentUser) {
          // displayName update
          await updateProfile(auth.currentUser, { displayName: name });
          // email update: attempt but may require reauth — swallow errors
          if (email && auth.currentUser.email !== email) {
            try {
              await auth.currentUser.updateEmail?.(email);
            } catch (ee) {
              // updateEmail may not be supported without reauth; ignore here
            }
          }
        }
      } catch (fberr) {
        // ignore firebase update failures for now
      }

      // update/propagate into localStorage.homeData so other pages read updated values
      try {
        const raw = localStorage.getItem('homeData');
        const parsed = raw ? JSON.parse(raw) : { committees: [], committeeData: {}, profile: {} };

        parsed.profile = parsed.profile || {};
        parsed.profile.name = name;
        parsed.profile.email = email;
        // joined timestamp omitted for now

        // Walk through all committeeData and update members that match the original profile
        const cmData = parsed.committeeData || {};
        Object.keys(cmData).forEach((cname) => {
          const cm = cmData[cname];
          if (!cm || !cm.members) return;
          cm.members = cm.members.map((m) => {
              if (typeof m === 'string') {
                if (origName && m === origName) {
                  return { name, email, role: 'member' };
                }
                return m;
              }
              // object member
              const mm = { ...m };
              if ((origName && mm.name === origName) || (origEmail && mm.email === origEmail)) {
                mm.name = name;
                mm.email = email;
              }
              return mm;
            });
          parsed.committeeData[cname] = cm;
        });

        // persist
        localStorage.setItem('homeData', JSON.stringify(parsed));

        // notify other components in this window to refresh from storage
        try { window.dispatchEvent(new Event('homeDataChanged')); } catch (ex) { /* ignore */ }
      } catch (e) {
        // ignore storage failures
      }

        setStatus('Saved');
        setTimeout(() => setStatus(''), 1500);
        // update originals after successful save
        setOrigName(name);
        setOrigEmail(email);
        setEditing(false);
    } catch (err) {
      console.error(err);
      setStatus('Failed to save');
    }
  }

  return (
    <div className="profile-page">
      <div className="profile-card">
        <h2>Your Profile</h2>
        {!editing ? (
          <div className="profile-view">
            <div className="profile-row"><strong>Name:</strong> <span>{name || '—'}</span></div>
            <div className="profile-row"><strong>Email:</strong> <span>{email || '—'}</span></div>
            
            <div className="profile-actions">
              <button type="button" className="btn" onClick={() => navigate(-1)}>Back</button>
              <button type="button" className="btn primary" onClick={() => setEditing(true)}>Edit Profile</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="profile-form">
            <label htmlFor="name">Display Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} />

            <label htmlFor="email">Email (read-only)</label>
            <input id="email" value={email} readOnly />

            

            <div className="profile-actions">
              <button type="button" className="btn" onClick={() => { setName(origName); setEditing(false); }}>Cancel</button>
              <button type="submit" className="btn primary">Save</button>
            </div>
            {status && <div className="profile-status">{status}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
