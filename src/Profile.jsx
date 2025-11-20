import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Profile.css';
import { auth } from './firebase/firebase';
import { updateProfile } from 'firebase/auth';
import { updateDisplayName } from './firebase/committees';

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
    if (currentUser) setName(currentUser.displayName || currentUser.email || '');
    else {
      // no local fallback — leave empty if not signed in
      setName('');
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
      // mirror into Firestore users collection (server copy)
      try {
        await updateDisplayName(name);
      } catch (e) {
        console.warn('Failed to update display name in Firestore:', e?.message || e);
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
