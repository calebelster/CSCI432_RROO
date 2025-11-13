// File: src/HomePage.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './HomePage.css';
import { createCommittee } from './firebase/committees';
import { db } from './firebase/firebase';
import { collectionGroup, query, where, onSnapshot, getDoc } from 'firebase/firestore';

function HomePage({ currentUser }) {
    const navigate = useNavigate();

    // Setup initial state with fallback values
    const [homeData, setHomeData] = useState(() => {
        try {
            const raw = localStorage.getItem('homeData');
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return {
            profile: { name: 'Profile Name' },
            stats: [
                { title: 'Your Committees', value: 0, description: "Active committees you're part of" },
                { title: 'Pending Motions', value: 0, description: "Motions requiring your attention" },
                { title: 'Upcoming Meetings', value: 0, description: 'Scheduled for this week' }
            ],
            committees: [],
            committeeData: {}
        };
    });

    const [modalOpen, setModalOpen] = useState(false);
    const [newCommittee, setNewCommittee] = useState({ name: '', description: '' });
    const [modalError, setModalError] = useState('');
    const [openMenuFor, setOpenMenuFor] = useState(null);
    const [confirmDeleteFor, setConfirmDeleteFor] = useState(null);
    const [creating, setCreating] = useState(false);

    // Persist to localStorage whenever homeData changes
    useEffect(() => {
        try {
            localStorage.setItem('homeData', JSON.stringify(homeData));
        } catch (e) {}
    }, [homeData]);

    // Redirect if not signed in, and update profile name
    useEffect(() => {
        if (!currentUser) {
            navigate('/login');
            return;
        }
        setHomeData(prev => ({
            ...prev,
            profile: { name: currentUser.displayName || currentUser.email || prev.profile.name }
        }));
    }, [currentUser, navigate]);

    // Real-time: find committees where the current user has a member doc
    useEffect(() => {
        if (!currentUser || !currentUser.uid) return;
        const q = query(
            collectionGroup(db, 'members'),
            where('uid', '==', currentUser.uid)
        );
        // Using document ID via '__name__', supported by Firestore SDK
        const unsub = onSnapshot(q, async (snap) => {
            const committeePromises = snap.docs.map(async (memberDoc) => {
                const committeeRef = memberDoc.ref.parent.parent;
                if (!committeeRef) return null;
                const cd = await getDoc(committeeRef);
                if (!cd.exists()) return null;
                const d = cd.data();
                return {
                    id: committeeRef.id,
                    name: d.name,
                    description: d.description,
                    role: memberDoc.data()?.role || 'Member',
                    settings: d.settings || {},
                    date: d.createdAt
                        ? (d.createdAt.toDate ? d.createdAt.toDate().toLocaleDateString() : String(d.createdAt))
                        : ''
                };
            });
            const committees = (await Promise.all(committeePromises)).filter(Boolean);
            setHomeData(prev => {
                const out = { ...prev, committees };
                // update stats count
                const stats = [...(out.stats || [])];
                if (stats[0]) stats[0] = { ...stats[0], value: committees.length };
                out.stats = stats;
                return out;
            });
        }, (err) => {
            console.warn('committee membership listener failed', err);
        });

        return () => unsub();
    }, [currentUser]);

    function handleCreateClick() {
        setModalOpen(true);
    }

    useEffect(() => {
        if (modalOpen) {
            const el = document.getElementById('committee-name');
            if (el) el.focus();
        }
    }, [modalOpen]);

    function handleCreateCancel() {
        setModalOpen(false);
        setNewCommittee({ name: '', description: '' });
        setModalError('');
    }

    async function handleCreateCommittee() {
        const name = newCommittee.name.trim();
        const description = newCommittee.description.trim();
        if (!name || !description) {
            setModalError('Please enter both a name and description.');
            return;
        }
        setModalError('');
        setCreating(true);
        let committeeId = null;
        try {
            committeeId = await createCommittee({ name, description, settings: {} });
        } catch (err) {
            console.warn('createCommittee failed:', err);
            setModalError('Created locally (Firestore failed).');
        } finally {
            setCreating(false);
        }

        setHomeData(prev => {
            const committees = [
                {
                    name,
                    description,
                    date: `Created ${new Date().toLocaleDateString()}`,
                    role: 'Owner',
                    id: committeeId
                },
                ...(prev.committees || [])
            ];
            const committeeData = { ...(prev.committeeData || {}) };
            if (!committeeData[name]) {
                committeeData[name] = {
                    members: [prev.profile.name],
                    motions: [],
                    meetings: []
                };
            }
            const stats = [...(prev.stats || [])];
            if (stats[0]) stats[0] = { ...stats[0], value: committees.length };
            const out = { ...prev, committees, committeeData, stats };
            try {
                localStorage.setItem('homeData', JSON.stringify(out));
            } catch (e) {}
            return out;
        });

        setModalOpen(false);
        setNewCommittee({ name: '', description: '' });
        setTimeout(() => {
            const container = document.querySelector('.committee-card-grid');
            if (container) container.scrollTo({ left: 0, behavior: 'smooth' });
        }, 80);
    }

    function enterCommittee(committee) {
        const committeeName = encodeURIComponent(committee.name);
        navigate(`/committee?name=${committeeName}`);
    }

    function handleDeleteCommittee(committee) {
        const ok = window.confirm(`Delete committee "${committee.name}"? This will remove all local data for this committee.`);
        if (!ok) return;
        setHomeData(prev => {
            const committees = (prev.committees || []).filter(c => c.name !== committee.name);
            const committeeData = { ...(prev.committeeData || {}) };
            if (committeeData[committee.name]) delete committeeData[committee.name];
            const stats = [...(prev.stats || [])];
            if (stats[0]) stats[0] = { ...stats[0], value: committees.length };
            const out = { ...prev, committees, committeeData, stats };
            try {
                localStorage.setItem('homeData', JSON.stringify(out));
            } catch (e) {}
            return out;
        });
    }

    return (
        <div className="container">
            <header className="header">
                <div className="header-logo">
                    <img src="/gavel_logo.png" alt="logo" />
                    <span>Robert Rules of Order</span>
                </div>
                <div
                    className="user-info"
                    onClick={() => navigate('/profile')}
                    title="Edit profile"
                    style={{ cursor: 'pointer' }}
                >
                    {homeData.profile.name}
                </div>
            </header>

            <main>
                <section className="welcome">
                    <h1>Welcome back!</h1>
                    <p>Manage your committees and participate in proceedings</p>
                </section>

                <section className="card-grid">
                    {homeData.stats.map((stat, idx) => (
                        <div className="card" key={idx}>
                            <div className="card-header">
                                <span className="title">{stat.title}</span>
                            </div>
                            <div className="card-content">
                                <h3>{stat.value}</h3>
                                <p>{stat.description}</p>
                            </div>
                        </div>
                    ))}
                </section>

                <section>
                    <div className="committees-header">
                        <h2>Your Committees</h2>
                        <button className="create-button" onClick={handleCreateClick}>
                            Create Committee
                        </button>
                    </div>
                    <div className="committee-card-grid">
                        {homeData.committees.map((committee, idx) => (
                            <div className="committee-card" key={committee.id || idx}>
                                <div>
                                    <div
                                        className="committee-header"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <h3>{committee.name}</h3>
                                            <span className="member-tag">{committee.role}</span>
                                        </div>
                                        <div className="card-more">
                                            <button
                                                className="more-btn"
                                                onClick={() =>
                                                    setOpenMenuFor(
                                                        openMenuFor === committee.name ? null : committee.name
                                                    )
                                                }
                                            >
                                                ⋯
                                            </button>
                                            {openMenuFor === committee.name && (
                                                <div className="more-menu-dropdown">
                                                    <button
                                                        className="more-item"
                                                        onClick={() => {
                                                            setConfirmDeleteFor(committee.name);
                                                            setOpenMenuFor(null);
                                                        }}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <p className="committee-description">{committee.description}</p>
                                </div>
                                <div className="committee-footer">
                                    <span className="date">{committee.date}</span>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            className="enter-button"
                                            onClick={() => enterCommittee(committee)}
                                        >
                                            Enter
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            <div className="help-icon">?</div>

            {modalOpen && (
                <div className="modal-overlay" style={{ display: 'flex' }}>
                    <div className="modal-content">
                        <div className="modal-header">
                            <div>
                                <h3>Create New Committee</h3>
                                <p>Set up a new committee for parliamentary proceedings</p>
                            </div>
                            <button className="modal-close" onClick={handleCreateCancel}>
                                &times;
                            </button>
                        </div>
                        <div className="modal-form">
                            <div className="modal-form-group">
                                <label htmlFor="committee-name">Committee Name</label>
                                <input
                                    id="committee-name"
                                    type="text"
                                    value={newCommittee.name}
                                    onChange={e =>
                                        setNewCommittee(prev => ({
                                            ...prev,
                                            name: e.target.value
                                        }))
                                    }
                                />
                            </div>
                            <div className="modal-form-group">
                                <label htmlFor="committee-description">Description</label>
                                <textarea
                                    id="committee-description"
                                    value={newCommittee.description}
                                    onChange={e =>
                                        setNewCommittee(prev => ({
                                            ...prev,
                                            description: e.target.value
                                        }))
                                    }
                                />
                            </div>
                            {modalError && (
                                <div className="modal-error" style={{ color: 'red', marginTop: 8 }}>
                                    {modalError}
                                </div>
                            )}
                        </div>
                        <div className="modal-buttons">
                            <button
                                type="button"
                                className="modal-button cancel"
                                onClick={handleCreateCancel}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="modal-button create"
                                onClick={handleCreateCommittee}
                                disabled={creating}
                            >
                                {creating ? 'Creating...' : 'Create Committee'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {confirmDeleteFor && (
                <div
                    className="confirm-overlay"
                    onClick={e => {
                        if (
                            e.target.className &&
                            e.target.className.includes('confirm-overlay')
                        )
                            setConfirmDeleteFor(null);
                    }}
                >
                    <div className="confirm-content">
                        <h3>Delete committee?</h3>
                        <p>
                            Are you sure you want to delete "{confirmDeleteFor}"? This will
                            remove all local data for this committee.
                        </p>
                        <div className="confirm-actions">
                            <button
                                className="confirm-cancel"
                                onClick={() => setConfirmDeleteFor(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="confirm-delete"
                                onClick={() => {
                                    const committeeObj = homeData.committees.find(
                                        c => c.name === confirmDeleteFor
                                    );
                                    if (committeeObj) {
                                        handleDeleteCommittee(committeeObj);
                                    }
                                    setConfirmDeleteFor(null);
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default HomePage;