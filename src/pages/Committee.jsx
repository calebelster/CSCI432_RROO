// javascript
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/Committee.css';
import { createMotion } from '../firebase/committees';
import { db } from '../firebase/firebase';
import { collection, doc, getDocs, query, where, onSnapshot, getDoc } from 'firebase/firestore';

export default function Committee() {
    const navigate = useNavigate();
    const location = useLocation();

    const getCommitteeName = () => {
        const params = new URLSearchParams(location.search);
        return params.get('name') || 'Board of Directors';
    };

    const [committeeName, setCommitteeName] = useState(getCommitteeName());
    const [committeeInfo, setCommitteeInfo] = useState({ name: committeeName, description: '' });
    const [committeeObj, setCommitteeObj] = useState(null); // { id, data }
    const [committeeData, setCommitteeData] = useState({ members: [], motions: [], meetings: [] });

    const [activeTab, setActiveTab] = useState('motions');
    const [motionFilter, setMotionFilter] = useState('active');

    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({
        type: 'Main Motion',
        title: '',
        description: '',
        threshold: 'Simple Majority',
        requiresDiscussion: false,
        secondRequired: true,
        discussionStyle: 'Offline',
        allowAnonymous: false,
    });
    const [showInvite, setShowInvite] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [creatingMotion, setCreatingMotion] = useState(false);

    useEffect(() => {
        setCommitteeName(getCommitteeName());
    }, [location.search]);

    // When committeeName changes, look up the committee doc by name
    useEffect(() => {
        let unsubMembers = null;
        let unsubMotions = null;
        async function lookup() {
            setCommitteeObj(null);
            setCommitteeData({ members: [], motions: [], meetings: [] });
            try {
                const q = query(collection(db, 'committees'), where('name', '==', committeeName));
                const snaps = await getDocs(q);
                if (snaps.empty) {
                    // fallback to localStorage if present
                    try {
                        const raw = localStorage.getItem('homeData');
                        if (raw) {
                            const parsed = JSON.parse(raw);
                            const localCommittee = (parsed.committees || []).find(c => c.name === committeeName) || { name: committeeName, description: '' };
                            const localData = parsed.committeeData ? parsed.committeeData[committeeName] : { members: [], motions: [], meetings: [] };
                            setCommitteeInfo(localCommittee);
                            setCommitteeData(localData || { members: [], motions: [], meetings: [] });
                        } else {
                            setCommitteeInfo({ name: committeeName, description: '' });
                        }
                        return;
                    } catch (e) { console.warn(e); }
                }

                // use first matching committee
                const docSnap = snaps.docs[0];
                const committeeId = docSnap.id;
                const data = docSnap.data();
                setCommitteeObj({ id: committeeId, data });
                setCommitteeInfo({ name: data.name, description: data.description });

                // listen members and enrich with user display names (if available)
                const membersCol = collection(db, 'committees', committeeId, 'members');
                unsubMembers = onSnapshot(membersCol, (msnap) => {
                    const rawMembers = msnap.docs.map(d => ({ uid: d.id, ...d.data() }));

                    // resolve display names from users collection where possible
                    (async () => {
                        try {
                            const enriched = await Promise.all(rawMembers.map(async (m) => {
                                if (m.displayName) return m;
                                try {
                                    const userDoc = await getDoc(doc(db, 'users', m.uid));
                                    if (userDoc.exists()) {
                                        const ud = userDoc.data();
                                        return { ...m, displayName: ud.displayName || m.displayName || null };
                                    }
                                } catch (e) {
                                    // ignore profile fetch errors per-member
                                }
                                return m;
                            }));
                            setCommitteeData(prev => ({ ...prev, members: enriched }));
                        } catch (e) {
                            // on any failure, fall back to raw member list
                            setCommitteeData(prev => ({ ...prev, members: rawMembers }));
                        }
                    })();
                });

                // listen motions
                const motionsCol = collection(db, 'committees', committeeId, 'motions');
                unsubMotions = onSnapshot(motionsCol, (msnap) => {
                    const motions = msnap.docs.map(d => {
                        const md = d.data();
                        return {
                            id: d.id,
                            name: md.title || md.name || 'Untitled Motion',
                            description: md.description || '',
                            creator: md.creatorUid || md.creator || '',
                            date: md.createdAt && md.createdAt.toDate ? new Date(md.createdAt.toDate()).toLocaleDateString() : '',
                            status: md.status || 'active',
                            type: md.type || '',
                            threshold: md.threshold || '',
                            requiresDiscussion: !!md.requiresDiscussion,
                            secondRequired: !!md.secondRequired,
                            discussionStyle: md.discussionStyle || 'Offline',
                            anonymousVotes: !!md.anonymousVotes,
                            tally: md.tally || { yes: 0, no: 0, abstain: 0 }
                        };
                    }).sort((a,b) => (b.date || '').localeCompare(a.date || ''));
                    setCommitteeData(prev => ({ ...prev, motions }));
                });

            } catch (err) {
                console.warn('committee lookup failed', err);
            }
        }
        lookup();

        return () => {
            if (unsubMembers) unsubMembers();
            if (unsubMotions) unsubMotions();
        };
    }, [committeeName]);

    function openModal() {
        // prefill defaults from committee settings if known
        const defaults = committeeObj?.data?.settings || {};
        setForm((prev) => ({
            ...prev,
            secondRequired: defaults.secondRequired ?? prev.secondRequired,
            discussionStyle: defaults.discussionStyle ?? prev.discussionStyle,
            allowAnonymous: defaults.allowAnonymous ?? prev.allowAnonymous
        }));
        setShowModal(true);
    }
    function closeModal() {
        setShowModal(false);
        setForm({ type: 'Main Motion', title: '', description: '', threshold: 'Simple Majority', requiresDiscussion: false, secondRequired: true, discussionStyle: 'Offline', allowAnonymous: false });
    }

    async function handleCreateMotion(e) {
        e.preventDefault();
        const motionPayload = {
            title: form.title || 'Untitled Motion',
            description: form.description || '',
            type: form.type,
            threshold: form.threshold,
            anonymousVotes: !!form.allowAnonymous,
            requiresDiscussion: !!form.requiresDiscussion,
            secondRequired: !!form.secondRequired,
            discussionStyle: form.discussionStyle || 'Offline',
        };

        const committeeId = committeeObj?.id || committeeName;
        setCreatingMotion(true);
        let motionId = null;
        try {
            motionId = await createMotion(committeeId, motionPayload);
        } catch (err) {
            console.warn('createMotion failed, falling back to local-only:', err);
        } finally {
            setCreatingMotion(false);
        }

        // If Firestore worked, the onSnapshot will insert motion. If not, add local fallback entry
        if (!motionId) {
            const newMotion = {
                id: Date.now() + Math.floor(Math.random() * 10000),
                name: motionPayload.title,
                description: motionPayload.description,
                creator: 'You',
                date: new Date().toLocaleDateString(),
                status: 'active',
                type: motionPayload.type,
                threshold: motionPayload.threshold,
                requiresDiscussion: !!motionPayload.requiresDiscussion,
                secondRequired: motionPayload.secondRequired,
                discussionStyle: motionPayload.discussionStyle,
                anonymousVotes: motionPayload.anonymousVotes,
            };
            setCommitteeData(prev => ({ ...prev, motions: [newMotion, ...(prev.motions || [])] }));
            try {
                const raw = localStorage.getItem('homeData');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    parsed.committeeData = parsed.committeeData || {};
                    parsed.committeeData[committeeName] = parsed.committeeData[committeeName] || { members: [], motions: [] };
                    parsed.committeeData[committeeName].motions = [newMotion, ...(parsed.committeeData[committeeName].motions || [])];
                    localStorage.setItem('homeData', JSON.stringify(parsed));
                }
            } catch (err) {}
        }

        closeModal();
        setActiveTab('motions');
        setMotionFilter('active');
    }

    const filteredMotions = (committeeData.motions || []).filter((m) => {
        if (motionFilter === 'all') return true;
        if (motionFilter === 'active') return m.status === 'active';
        if (motionFilter === 'completed') return m.status === 'completed';
        return true;
    });

    const allCount = (committeeData.motions || []).length;
    const activeCount = (committeeData.motions || []).filter((m) => m.status === 'active').length;
    const completedCount = (committeeData.motions || []).filter((m) => m.status === 'completed').length;

    function viewMotion(motion) {
        try {
            sessionStorage.setItem('motion_' + motion.id, JSON.stringify({ ...motion, committeeId: committeeObj?.id || committeeName }));
        } catch (e) {}
        navigate(`/motions?id=${motion.id}`);
    }

    function performDelete() {
        try {
            const raw = localStorage.getItem('homeData');
            if (raw) {
                const parsed = JSON.parse(raw);
                parsed.committees = (parsed.committees || []).filter(c => c.name !== committeeName);
                if (parsed.committeeData && parsed.committeeData[committeeName]) delete parsed.committeeData[committeeName];
                localStorage.setItem('homeData', JSON.stringify(parsed));
            }
        } catch (e) {}
        navigate('/home');
    }

    return (
        <div className="committee-container">
            <div className="committee-header-bar">
                <div className="committee-header-left">
                    <button className="back-btn" onClick={() => navigate('/home')}>← Back</button>
                    <div>
                        <h1 id="committee-title">{committeeInfo.name}</h1>
                        <p id="committee-desc">{committeeInfo.description}</p>
                    </div>
                </div>
                <div className="committee-header-right">
                    <button className="invite-btn" onClick={() => setShowInvite(true)}>Invite Members</button>
                    <button className="new-motion-btn" onClick={openModal}><span className="plus">+</span> New Motion</button>
                    <div className="more-container">
                        <button className="more-btn" onClick={() => setShowMenu((s) => !s)}>⋯</button>
                        {showMenu && (
                            <div className="more-menu-dropdown">
                                <button className="more-item" onClick={() => { setConfirmDelete(true); setShowMenu(false); }}>Delete Committee</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="tab-bar">
                <button className={`tab ${activeTab === 'motions' ? 'active' : ''}`} onClick={() => setActiveTab('motions')} data-tab="motions">Motions</button>
                <button className={`tab ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')} data-tab="members">Members</button>
            </div>

            <div className="tab-content">
                {activeTab === 'motions' ? (
                    <div className="motions-section">
                        <div className="motions-header">Motions</div>
                        <div className="motion-filters">
                            <button className={`filter-btn ${motionFilter === 'all' ? 'active' : ''}`} onClick={() => setMotionFilter('all')}>All</button>
                            <button className={`filter-btn ${motionFilter === 'active' ? 'active' : ''}`} onClick={() => setMotionFilter('active')}>Active ({activeCount})</button>
                            <button className={`filter-btn ${motionFilter === 'completed' ? 'active' : ''}`} onClick={() => setMotionFilter('completed')}>Completed ({completedCount})</button>
                        </div>
                        <div className="motions-list">
                            {filteredMotions.length === 0 ? (
                                <div className="no-motions">No motions found.</div>
                            ) : (
                                filteredMotions.map((motion) => (
                                    <div key={motion.id} className="motion-card">
                                        <h3>{motion.name}</h3>
                                        <p className="motion-desc">{motion.description}</p>
                                        <div className="motion-card-footer">
                                            <div className="motion-meta">
                                                <span className="creator">{motion.creator}</span>
                                                <span className="date">{motion.date}</span>
                                            </div>
                                            <button className="view-details-btn" onClick={() => viewMotion(motion)}>View Details</button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="members-section">
                        <div className="members-header">Members</div>
                        <div className="members-card">
                            <table className="members-table">
                                <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Position</th>
                                </tr>
                                </thead>
                                <tbody>
                                {(committeeData.members || []).map((member, idx) => (
                                    <tr key={member.uid || idx}>
                                        <td className="member-name">{member.displayName || member.uid}</td>
                                        <td className="member-pos">{member.role || 'Member'}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target.className && e.target.className.includes('modal-overlay')) closeModal(); }}>
                    <div className="modal-content">
                        <button className="modal-close" onClick={closeModal}>&times;</button>
                        <h2>Create New Motion</h2>
                        <p className="modal-sub">Submit a new motion for committee consideration</p>
                        <form className="motion-form" autoComplete="off" onSubmit={handleCreateMotion}>
                            <div className="form-row">
                                <label className="form-label">Motion Type</label>
                                <select name="type" id="motion-type-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="form-select">
                                    <option value="Main Motion">Main Motion</option>
                                    <option value="Subsidiary Motion">Subsidiary Motion</option>
                                    <option value="Privileged Motion">Privileged Motion</option>
                                    <option value="Incidental Motion">Incidental Motion</option>
                                    <option value="Procedural Motion">Procedural Motion</option>
                                </select>
                            </div>
                            <div className="form-row">
                                <label className="form-label">Motion Title *</label>
                                <input name="title" type="text" required placeholder="e.g., Approve Budget for Q2 2024" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="form-input" />
                            </div>

                            <div className="form-row">
                                <label className="form-label">Motion Description *</label>
                                <textarea name="description" required placeholder="Provide a detailed description..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="form-textarea" />
                            </div>

                            <div className="form-row">
                                <label className="form-label">Vote Threshold Required</label>
                                <select name="threshold" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} className="form-select">
                                    <option value="Simple Majority">Simple Majority</option>
                                    <option value="Two-Thirds">Two-Thirds</option>
                                    <option value="Unanimous">Unanimous</option>
                                </select>
                                <small className="form-note">More than 50% of votes cast</small>
                            </div>

                            <div className="form-row requires-row">
                                <div className="requires-left">
                                    <label className="form-label-inline">Requires Discussion</label>
                                    <span className="form-help">Allow members to discuss this motion before voting</span>
                                </div>
                                <div className="requires-right">
                                    <label className="switch">
                                        <input type="checkbox" name="requiresDiscussion" checked={form.requiresDiscussion} onChange={(e) => setForm({ ...form, requiresDiscussion: e.target.checked })} />
                                        <span className="switch-slider" />
                                    </label>
                                </div>
                            </div>

                            <div className="committee-settings">
                                <div className="settings-title">Motion Settings</div>
                                <div className="settings-list">
                                    <div className="form-row">
                                        <label className="form-label">Second Required</label>
                                        <label className="switch">
                                            <input type="checkbox" name="secondRequired" checked={form.secondRequired} onChange={(e) => setForm({ ...form, secondRequired: e.target.checked })} />
                                            <span className="switch-slider" />
                                        </label>
                                    </div>
                                    <div className="form-row">
                                        <label className="form-label">Discussion Style</label>
                                        <select value={form.discussionStyle} onChange={(e) => setForm({ ...form, discussionStyle: e.target.value })} className="form-select">
                                            <option value="Offline">Offline</option>
                                            <option value="Online">Online</option>
                                            <option value="Hybrid">Hybrid</option>
                                        </select>
                                    </div>
                                    <div className="form-row">
                                        <label className="form-label">Allow Anonymous Voting</label>
                                        <label className="switch">
                                            <input type="checkbox" name="allowAnonymous" checked={form.allowAnonymous} onChange={(e) => setForm({ ...form, allowAnonymous: e.target.checked })} />
                                            <span className="switch-slider" />
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="form-actions">
                                <button type="submit" className="modal-create" disabled={creatingMotion}>{creatingMotion ? 'Creating...' : 'Create Motion'}</button>
                                <button type="button" className="modal-cancel" onClick={closeModal}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {confirmDelete && (
                <div className="confirm-overlay" onClick={(e) => { if (e.target.className && e.target.className.includes('confirm-overlay')) setConfirmDelete(false); }}>
                    <div className="confirm-content">
                        <h3>Delete committee?</h3>
                        <p>Are you sure you want to delete "{committeeName}"? This will remove all local data for this committee.</p>
                        <div className="confirm-actions">
                            <button className="confirm-cancel" onClick={() => setConfirmDelete(false)}>Cancel</button>
                            <button className="confirm-delete" onClick={() => { setConfirmDelete(false); performDelete(); }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
            {showInvite && (
                <div className="invite-overlay" onClick={(e) => { if (e.target.className && e.target.className.includes('invite-overlay')) setShowInvite(false); }}>
                    <div className="invite-content">
                        <button className="modal-close" onClick={() => setShowInvite(false)}>&times;</button>
                        <h3>Invite Members</h3>
                        <p>Share a link to this committee or give collaborators the invite code.</p>
                        <div className="invite-row">
                            <label>Shareable Link</label>
                            <div className="invite-box">
                                <input readOnly value={(window.location.origin || '') + '/committee?name=' + encodeURIComponent(committeeName)} />
                                <button onClick={() => navigator.clipboard && navigator.clipboard.writeText((window.location.origin || '') + '/committee?name=' + encodeURIComponent(committeeName))}>Copy</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}