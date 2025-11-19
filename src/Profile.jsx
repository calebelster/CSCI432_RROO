// File: `src/Profile.jsx`
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Profile.css';
import { auth } from './firebase/firebase';
import { updateProfile } from 'firebase/auth';
import { updateDisplayName } from './firebase/committees';

export default function Profile({ currentUser }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (currentUser) setName(currentUser.displayName || '');
    else {
      try {
        const raw = localStorage.getItem('homeData');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.profile && parsed.profile.name) setName(parsed.profile.name);
        }
      } catch (e) { }
    }
  }, [currentUser]);

  function formattedMemberSince() {
    const created = currentUser?.metadata?.creationTime || currentUser?.createdAt || null;
    if (!created) return '';
    try {
      const d = new Date(created);
      return `Member since ${d.toLocaleDateString()}`;
    } catch (e) {
      return `Member since ${created}`;
    }
  }

  async function handleSave(e) {
    e && e.preventDefault();
    setStatus('Saving...');
    try {
      try {
        await updateDisplayName(name);
      } catch (err) {
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, { displayName: name });
        }
      }
      try {
        const raw = localStorage.getItem('homeData');
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.profile = parsed.profile || {};
          parsed.profile.name = name;
          localStorage.setItem('homeData', JSON.stringify(parsed));
        }
      } catch (e) { }

      setStatus('Saved');
      setEditing(false);
      setTimeout(() => setStatus(''), 1600);
    } catch (err) {
      setStatus('Failed to save');
      console.error(err);
    }
  }

  return (
    <div className="profile-page">
      <div className="profile-card profile-card-large">
        <div className="profile-top">
          <div className="avatar-circle">{(currentUser?.displayName || name || 'U').slice(0, 1).toUpperCase()}</div>
          <div className="profile-header">
            <div className="profile-name">{currentUser?.displayName || name || ''}</div>
            <div className="profile-email">{currentUser?.email || ''}</div>
            <div className="profile-member-since">{formattedMemberSince()}</div>
          </div>
        </div>

        {!editing ? (
          <div style={{ marginTop: 18 }}>
            <button className="btn primary" onClick={() => setEditing(true)}>Edit Profile</button>
            <button className="btn" style={{ marginLeft: 8 }} onClick={() => navigate(-1)}>Back</button>
            {status && <div className="profile-status">{status}</div>}
          </div>
        ) : (
          <form onSubmit={handleSave} className="profile-form" style={{ marginTop: 18 }}>
            <label htmlFor="name">Full Name</label>
            <input id="name" value={name} onChange={e => setName(e.target.value)} />
            <div className="profile-actions">
              <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
              <button type="submit" className="btn primary">Save</button>
            </div>
            {status && <div className="profile-status">{status}</div>}
          </form>
        )}
      </div>
    </div>
  );
}