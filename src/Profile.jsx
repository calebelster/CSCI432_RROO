import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Profile.css';
import { auth } from './firebase/firebase';
import { updateProfile } from 'firebase/auth';
import { updateDisplayName } from './firebase/committees';

export default function Profile({ currentUser }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');

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
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: name });
      }
      // mirror into Firestore users collection (server copy)
      try {
        await updateDisplayName(name);
      } catch (e) {
        console.warn('Failed to update display name in Firestore:', e?.message || e);
      }
      setStatus('Saved');
      setTimeout(() => setStatus(''), 1600);
    } catch (err) {
      setStatus('Failed to save');
      console.error(err);
    }
  }

  return (
    <div className="profile-page">
      <div className="profile-card">
        <h2>Your Profile</h2>
        <form onSubmit={handleSave} className="profile-form">
          <label htmlFor="name">Display Name</label>
          <input id="name" value={name} onChange={e => setName(e.target.value)} />
          <div className="profile-actions">
            <button type="button" className="btn" onClick={() => navigate(-1)}>Back</button>
            <button type="submit" className="btn primary">Save</button>
          </div>
          {status && <div className="profile-status">{status}</div>}
        </form>
      </div>
    </div>
  );
}
