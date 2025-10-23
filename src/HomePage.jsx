import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './HomePage.css';
import gavelLogo from '../public/gavel_logo.png';

function HomePage() {
    const navigate = useNavigate();
    const [homeData, setHomeData] = useState(() => ({
        profile: { name: 'Profile Name' },
        stats: [
            { title: 'Your Committees', value: 2, description: "Active committees you're part of" },
            { title: 'Pending Motions', value: 3, description: "Motions requiring your attention" },
            { title: 'Upcoming Meetings', value: 1, description: 'Scheduled for this week' }
        ],
        committees: [
            { name: 'Board of Directors', description: 'Monthly board meeting for strategic decisions', date: 'Created 1/14/2024', role: 'Member' },
            { name: 'Budget Committee', description: 'Quarterly budget review and approval', date: 'Created 1/31/2024', role: 'Member' }
        ],
        committeeData: {
            'Board of directors': { members: ['User Initial'], motions: [], meetings: [] },
            'Budget Committee': { members: ['User Initial'], motions: [], meetings: [] }
        }
    }));

    const [modalOpen, setModalOpen] = useState(false);
    const [newCommittee, setNewCommittee] = useState({ name: '', description: '' });

    useEffect(() => {
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (!currentUser) {
            navigate('/login');
            return;
        }
        // Optionally set profile name
        setHomeData(prev => ({ ...prev, profile: { name: currentUser.fullName || prev.profile.name } }));
    }, [navigate]);

    function handleCreateClick() {
        setModalOpen(true);
    }

    function handleCreateCancel() {
        setModalOpen(false);
        setNewCommittee({ name: '', description: '' });
    }

    function handleCreateCommittee() {
        const name = newCommittee.name.trim();
        const description = newCommittee.description.trim();
        if (!name || !description) return;
        setHomeData(prev => {
            const committees = [...prev.committees, { name, description, date: `Created ${new Date().toLocaleDateString()}`, role: 'Member' }];
            const committeeData = { ...prev.committeeData };
            if (!committeeData[name]) committeeData[name] = { members: [prev.profile.name], motions: [], meetings: [] };
            const stats = [...prev.stats];
            stats[0] = { ...stats[0], value: committees.length };
            return { ...prev, committees, committeeData, stats };
        });
        setModalOpen(false);
        setNewCommittee({ name: '', description: '' });
    }

    function enterCommittee(committee) {
        const committeeName = encodeURIComponent(committee.name);
        window.location.href = `../committee/committee.html?name=${committeeName}`;
    }

    return (
        <div className="container">
            <header className="header">
                <div className="header-logo">
                    <img src={gavelLogo} alt="logo" />
                    <span>Robert Rules of Order</span>
                </div>
                <div className="user-info">{homeData.profile.name}</div>
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
                                    <div className="committee-header">
                                        <h3>{committee.name}</h3>
                                        <span className="member-tag">{committee.role}</span>
                                    </div>
                                    <p className="committee-description">{committee.description}</p>
                                </div>
                                <div className="committee-footer">
                                    <span className="date">{committee.date}</span>
                                    <button className="enter-button" onClick={() => enterCommittee(committee)}>Enter</button>
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
                        </div>
                        <div className="modal-buttons">
                            <button className="modal-button cancel" onClick={handleCreateCancel}>Cancel</button>
                            <button className="modal-button create" onClick={handleCreateCommittee}>Create Committee</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default HomePage;