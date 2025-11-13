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
    const [status, setStatus] = useState('');

    useEffect(() => {
        if (currentUser) setName(currentUser.displayName || currentUser.email || '');
        else {
            try {
                const raw = localStorage.getItem('homeData');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.profile && parsed.profile.name) setName(parsed.profile.name);
                }
            } catch (e) {}
        }
    }, [currentUser]);

    async function handleSave(e) {
        e.preventDefault();
        setStatus('Saving...');
        try {
            // Prefer centralized helper that updates both Auth and Firestore mirror
            try {
                await updateDisplayName(name);
            } catch (err) {
                // fallback to updating auth profile directly if helper fails
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
            } catch (e) {}

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