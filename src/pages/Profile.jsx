// File: `src/Profile.jsx`
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Profile.css';
import { auth } from '../firebase/firebase';
import { updateProfile, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { updateDisplayName } from '../firebase/committees';
import { doSignOut } from '../firebase/auth';

export default function Profile({ currentUser }) {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [status, setStatus] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwStatus, setPwStatus] = useState('');

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

    async function handleChangePassword(e) {
        e.preventDefault();
        setPwStatus('Updating password...');
        try {
            if (!auth.currentUser) throw new Error('Not signed in');
            if (!newPassword || newPassword.length < 6) {
                throw new Error('New password must be at least 6 characters');
            }
            if (newPassword !== confirmPassword) {
                setPwStatus('New password and confirmation do not match.');
                return;
            }
            // Reauthenticate if email/password user
            if (auth.currentUser.email) {
                const cred = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
                await reauthenticateWithCredential(auth.currentUser, cred);
            }
            // Use modular helper to update password
            const { doPasswordChange } = await import('../firebase/auth');
            await doPasswordChange(newPassword);
            setPwStatus('Password updated');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setTimeout(() => setPwStatus(''), 1600);
        } catch (err) {
            console.error(err);
            let msg = 'Failed to update password';
            const code = err && (err.code || (err.customData && err.customData._serverResponse && ''));
            if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
                msg = 'Current password is incorrect.';
            } else if (code === 'auth/too-many-requests') {
                msg = 'Too many attempts. Please try again later.';
            } else if (code === 'auth/weak-password') {
                msg = 'New password is too weak.';
            }
            setPwStatus(msg);
        }
    }

    async function handleLogout() {
        try {
            await doSignOut();
            navigate('/login');
        } catch (e) {
            console.error('Logout failed', e);
            setStatus('Failed to log out');
            setTimeout(() => setStatus(''), 1600);
        }
    }

    return (
        <div className="profile-page">
            <button
                type="button"
                className="profile-back"
                onClick={() => navigate('/home')}
                aria-label="Back to Home"
            >
                Back
            </button>
            <button
                type="button"
                className="profile-logout"
                onClick={handleLogout}
                aria-label="Log Out"
            >
                Log Out
            </button>
            <div className="profile-card">
                <h2>Your Profile</h2>
                <form onSubmit={handleSave} className="profile-form">
                    <label htmlFor="name">Display Name</label>
                    <input id="name" value={name} onChange={e => setName(e.target.value)} />
                    <div className="profile-actions">
                        <div style={{ flex: 1 }} />
                        <button type="submit" className="btn primary">Save</button>
                    </div>
                    {status && <div className="profile-status">{status}</div>}
                </form>
                <hr style={{ opacity: 0.2, margin: '16px 0' }} />
                <form onSubmit={handleChangePassword} className="profile-form">
                    <label htmlFor="currentPassword">Current Password</label>
                    <input id="currentPassword" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                    <label htmlFor="newPassword">New Password</label>
                    <input id="newPassword" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                    <label htmlFor="confirmPassword">Confirm New Password</label>
                    <input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                    <div className="profile-actions">
                        <div style={{ flex: 1 }} />
                        <button type="submit" className="btn primary">Change Password</button>
                    </div>
                    {pwStatus && <div className="profile-status">{pwStatus}</div>}
                </form>
            </div>
        </div>
    );
}