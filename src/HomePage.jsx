import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './HomePage.css';

function HomePage({ currentUser }) {
    const navigate = useNavigate();
    function generateInviteCode(len = 6) {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let out = '';
        for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * Math.random() * chars.length));
        return out;
    }
    const [homeData, setHomeData] = useState(() => {
        // load persisted homeData so created committees persist across reloads
        try {
            const raw = localStorage.getItem('homeData');
            if (raw) return JSON.parse(raw);
        } catch (e) {
            // ignore
        }
        return {
            profile: { name: 'Profile Name' },
            stats: [
                { title: 'Your Committees', value: 2, description: "Active committees you're part of" },
                { title: 'Pending Motions', value: 3, description: "Motions requiring your attention" },
                { title: 'Upcoming Meetings', value: 0, description: 'Scheduled for this week' }
            ],
            committees: [
                { name: 'Board of Directors', description: 'Monthly board meeting for strategic decisions', date: 'Created 1/14/2024', role: 'Member' },
                { name: 'Budget Committee', description: 'Quarterly budget review and approval', date: 'Created 1/31/2024', role: 'Member' }
            ],
            committeeData: {
                'Board of directors': { members: ['User Initial'], motions: [], meetings: [] },
                'Budget Committee': { members: ['User Initial'], motions: [], meetings: [] }
            }
        };
    });

    const [modalOpen, setModalOpen] = useState(false);
    const [newCommittee, setNewCommittee] = useState({ name: '', description: '' });
    const [modalError, setModalError] = useState('');
    const [openMenuFor, setOpenMenuFor] = useState(null);
    const [confirmDeleteFor, setConfirmDeleteFor] = useState(null);

    // persist homeData to localStorage whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem('homeData', JSON.stringify(homeData));
        } catch (e) {
            // ignore
        }
    }, [homeData]);

    // Recompute Pending Motions stat: total active motions across all committees
    useEffect(() => {
        try {
            const cmData = homeData.committeeData || {};
            let pending = 0;
            Object.values(cmData).forEach(cm => {
                if (!cm || !cm.motions) return;
                pending += (cm.motions || []).filter(m => m && m.status === 'active').length;
            });

            const currentPending = (homeData.stats && homeData.stats[1] && typeof homeData.stats[1].value === 'number') ? homeData.stats[1].value : null;
            if (currentPending !== pending) {
                setHomeData(prev => {
                    const stats = Array.isArray(prev.stats) ? [...prev.stats] : [];
                    // ensure at least 3 slots
                    while (stats.length < 3) stats.push({ title: '', value: 0, description: '' });
                    stats[1] = { ...(stats[1] || {}), title: 'Pending Motions', value: pending, description: 'Motions requiring your attention' };
                    return { ...prev, stats };
                });
            }
        } catch (e) {
            // ignore
        }
    }, [homeData.committeeData]);

    // Ensure Upcoming Meetings stat reflects total meetings (currently not used) — keep at 0 if none
    useEffect(() => {
        try {
            const cmData = homeData.committeeData || {};
            let meetingsCount = 0;
            Object.values(cmData).forEach(cm => {
                if (!cm || !cm.meetings) return;
                meetingsCount += (cm.meetings || []).length;
            });

            const currentMeetings = (homeData.stats && homeData.stats[2] && typeof homeData.stats[2].value === 'number') ? homeData.stats[2].value : null;
            if (currentMeetings !== meetingsCount) {
                setHomeData(prev => {
                    const stats = Array.isArray(prev.stats) ? [...prev.stats] : [];
                    while (stats.length < 3) stats.push({ title: '', value: 0, description: '' });
                    stats[2] = { ...(stats[2] || {}), title: 'Upcoming Meetings', value: meetingsCount, description: 'Scheduled for this week' };
                    return { ...prev, stats };
                });
            }
        } catch (e) {
            // ignore
        }
    }, [homeData.committeeData]);

    useEffect(() => {
        if (!currentUser) {
            navigate('/login');
            return;
        }
        // Optionally set profile name
        setHomeData(prev => ({ ...prev, profile: { name: currentUser.displayName || currentUser.email || prev.profile.name, email: currentUser.email || '' } }));
    }, [currentUser, navigate]);

    function handleCreateClick() {
        setModalOpen(true);
    }

    // focus the name input when modal opens
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

    function handleCreateCommittee() {
        const name = newCommittee.name.trim();
        const description = newCommittee.description.trim();
        if (!name || !description) {
            setModalError('Please enter both a name and description.');
            return;
        }
        setModalError('');
        setHomeData(prev => {
            // prepend the newly created committee so it appears first
            const inviteCode = generateInviteCode();
            const committees = [{ name, description, date: `Created ${new Date().toLocaleDateString()}`, role: 'Owner', inviteCode }, ...prev.committees];
            const committeeData = { ...prev.committeeData };
            if (!committeeData[name]) committeeData[name] = { members: [{ name: prev.profile.name, role: 'owner', email: prev.profile.email || '', joined: Date.now() }], motions: [], meetings: [] };
            const stats = [...prev.stats];
            stats[0] = { ...stats[0], value: committees.length };
            return { ...prev, committees, committeeData, stats };
        });
        setModalOpen(false);
        setNewCommittee({ name: '', description: '' });
        // scroll the committees container to show the newest card
        setTimeout(() => {
            const container = document.querySelector('.committee-card-grid');
            if (container) container.scrollTo({ left: 0, behavior: 'smooth' });
        }, 80);
    }

    

    function enterCommittee(committee) {
        const committeeName = encodeURIComponent(committee.name);
        // navigate to the React Committee route with query param
        navigate(`/committee?name=${committeeName}`);
    }

    function handleDeleteCommittee(committee) {
        const ok = window.confirm(`Delete committee "${committee.name}"? This will remove all local data for this committee.`);
        if (!ok) return;
        setHomeData(prev => {
            const committees = (prev.committees || []).filter(c => c.name !== committee.name);
            const committeeData = { ...prev.committeeData };
            if (committeeData[committee.name]) delete committeeData[committee.name];
            const stats = [...prev.stats];
            stats[0] = { ...stats[0], value: committees.length };
            const out = { ...prev, committees, committeeData, stats };
            // persist immediately
            try { localStorage.setItem('homeData', JSON.stringify(out)); } catch (e) {}
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
                <div className="user-info" onClick={() => navigate('/profile')} title="Edit profile" style={{ cursor: 'pointer' }}>{homeData.profile.name}</div>
            </header>

            <main>
                <section className="welcome">
                    <h1>Welcome back!</h1>
                    <p>Manage your committees and participate in proceedings</p>
                </section>

                <section className="card-grid">
                    {homeData.stats.map((stat, idx) => (
                        <div className="card" key={idx}>
                            <div className="card-header"><span className="title">{stat.title}</span></div>
                            <div className="card-content"><h3>{stat.value}</h3><p>{stat.description}</p></div>
                        </div>
                    ))}
                </section>

                <section>
                    <div className="committees-header">
                        <h2>Your Committees</h2>
                        <button className="create-button" onClick={handleCreateClick}>Create Committee</button>
                    </div>
                    <div className="committee-card-grid">
                        {homeData.committees.map((committee, idx) => (
                            <div className="committee-card" key={idx}>
                                <div>
                                    <div className="committee-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <h3>{committee.name}</h3>
                                            <span className="member-tag">{committee.role}</span>
                                        </div>
                                        <div className="card-more">
                                            <button className="more-btn" onClick={() => setOpenMenuFor(openMenuFor === committee.name ? null : committee.name)}>⋯</button>
                                            {openMenuFor === committee.name && (
                                                <div className="more-menu-dropdown">
                                                    <button className="more-item" onClick={() => { setConfirmDeleteFor(committee.name); setOpenMenuFor(null); }}>Delete</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <p className="committee-description">{committee.description}</p>
                                </div>
                                <div className="committee-footer">
                                    <span className="date">{committee.date}</span>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="enter-button" onClick={() => enterCommittee(committee)}>Enter</button>
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
                            <button className="modal-close" onClick={handleCreateCancel}>&times;</button>
                        </div>
                        <div className="modal-form">
                            <div className="modal-form-group">
                                <label htmlFor="committee-name">Committee Name</label>
                                <input id="committee-name" type="text" value={newCommittee.name} onChange={e => setNewCommittee(prev => ({ ...prev, name: e.target.value }))} />
                            </div>
                            <div className="modal-form-group">
                                <label htmlFor="committee-description">Description</label>
                                <textarea id="committee-description" value={newCommittee.description} onChange={e => setNewCommittee(prev => ({ ...prev, description: e.target.value }))} />
                            </div>
                            {modalError && <div className="modal-error" style={{ color: 'red', marginTop: 8 }}>{modalError}</div>}
                        </div>
                        <div className="modal-buttons">
                            <button type="button" className="modal-button cancel" onClick={handleCreateCancel}>Cancel</button>
                            <button type="button" className="modal-button create" onClick={handleCreateCommittee}>Create Committee</button>
                        </div>
                    </div>
                </div>
            )}
            {confirmDeleteFor && (
                <div className="confirm-overlay" onClick={(e) => { if (e.target.className && e.target.className.includes('confirm-overlay')) setConfirmDeleteFor(null); }}>
                    <div className="confirm-content">
                        <h3>Delete committee?</h3>
                        <p>Are you sure you want to delete "{confirmDeleteFor}"? This will remove all local data for this committee.</p>
                        <div className="confirm-actions">
                            <button className="confirm-cancel" onClick={() => setConfirmDeleteFor(null)}>Cancel</button>
                            <button className="confirm-delete" onClick={() => { const committeeObj = homeData.committees.find(c => c.name === confirmDeleteFor); if (committeeObj) { handleDeleteCommittee(committeeObj); } setConfirmDeleteFor(null); }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
            
        </div>
    );
}

export default HomePage;