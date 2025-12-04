// javascript
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/Committee.css';
import { createMotion, deleteMotion, approveMotion, closeMotionVoting } from '../firebase/committees';
import { db, auth } from '../firebase/firebase';
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
        voteThreshold: 'Simple Majority', // Consolidated vote threshold field
        // all motions require discussion by default; UI no longer exposes this option
        requiresDiscussion: true,
        secondRequired: true,
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
                    // No server committee found — show empty/default state (no localStorage fallback)
                    setCommitteeInfo({ name: committeeName, description: '' });
                    setCommitteeData({ members: [], motions: [], meetings: [] });
                    return;
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

                    // resolve profile info (displayName, email, photoURL, joinedAt) from users collection where possible
                    (async () => {
                        try {
                            const enriched = await Promise.all(rawMembers.map(async (m) => {
                                if (m.displayName && (m.email || m.photoURL || m.joinedAt)) return m;
                                try {
                                    const userDoc = await getDoc(doc(db, 'users', m.uid));
                                    if (userDoc.exists()) {
                                        const ud = userDoc.data();
                                        const joined = ud.createdAt ? (ud.createdAt.toDate ? ud.createdAt.toDate().toLocaleDateString() : ud.createdAt) : null;
                                        return {
                                            ...m,
                                            displayName: ud.displayName || m.displayName || null,
                                            email: ud.email || m.email || null,
                                            photoURL: ud.photoURL || m.photoURL || null,
                                            joinedAt: joined || m.joinedAt || null
                                        };
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
                            creator: md.creatorDisplayName || md.creatorUid || md.creator || '',
                            creatorUid: md.creatorUid, // Include creatorUid for authorization checks
                            date: md.createdAt && md.createdAt.toDate ? new Date(md.createdAt.toDate()).toLocaleDateString() : '',
                            status: md.status || 'active',
                            type: md.type || '',
                            threshold: md.voteThreshold || 'Simple Majority', // Consolidated vote threshold field

                            requiresDiscussion: !!md.requiresDiscussion,
                            secondRequired: !!md.secondRequired,
                            discussionStyle: md.discussionStyle || 'Offline',
                            anonymousVotes: !!md.anonymousVotes,
                            tally: md.tally || { yes: 0, no: 0, abstain: 0 }
                        };
                    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
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
            allowAnonymous: defaults.allowAnonymous ?? prev.allowAnonymous
        }));
        setShowModal(true);
    }
    function closeModal() {
        setShowModal(false);
        setForm({ type: 'Main Motion', title: '', description: '', voteThreshold: 'Simple Majority', requiresDiscussion: true, secondRequired: true, allowAnonymous: false });
    }

    async function handleCreateMotion(e) {
        e.preventDefault();
        const motionPayload = {
            title: form.title || 'Untitled Motion',
            description: form.description || '',
            type: form.type,
            threshold: form.voteThreshold, // Using voteThreshold as the primary threshold
            anonymousVotes: !!form.allowAnonymous,
            // all motions require discussion in this app
            requiresDiscussion: true,
            secondRequired: !!form.secondRequired,
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
                threshold: motionPayload.threshold, // Use motionPayload.threshold
                requiresDiscussion: !!motionPayload.requiresDiscussion,
                secondRequired: motionPayload.secondRequired,
                discussionStyle: motionPayload.discussionStyle,
                anonymousVotes: motionPayload.anonymousVotes,
            };
            setCommitteeData(prev => ({ ...prev, motions: [newMotion, ...(prev.motions || [])] }));
            // No localStorage persistence — do not persist fallback motions locally
        }

        closeModal();
        setActiveTab('motions');
        setMotionFilter('active');
    }

    const filteredMotions = (committeeData.motions || []).filter((m) => {
        if (motionFilter === 'all') return m.status !== 'deleted'; // Show all non-deleted motions
        if (motionFilter === 'active') return (m.status === 'active' || m.status === 'closed') && m.status !== 'deleted'; // Active or Closed, but not Deleted
        if (motionFilter === 'approved') return m.status === 'completed'; // Approved maps to completed status
        if (motionFilter === 'denied') return m.status === 'denied'; // Denied motions (if used)
        return false; // Should not reach here
    });

    const allCount = (committeeData.motions || []).filter((m) => m.status !== 'deleted').length; // All non-deleted motions
    const activeCount = (committeeData.motions || []).filter((m) => (m.status === 'active' || m.status === 'closed') && m.status !== 'deleted').length; // Active or Closed, but not Deleted
    const approvedCount = (committeeData.motions || []).filter((m) => m.status === 'completed').length; // Approved (completed)
    const deniedCount = (committeeData.motions || []).filter((m) => m.status === 'denied').length; // Denied (if used)

    function viewMotion(motion) {
        try {
            sessionStorage.setItem('motion_' + motion.id, JSON.stringify({ ...motion, committeeId: committeeObj?.id || committeeName, creatorUid: motion.creatorUid }));
        } catch (e) { }
        navigate(`/motions?id=${motion.id}`);
    }

    async function handleDeleteMotion(motionId) {
        if (!window.confirm('Are you sure you want to delete this motion?')) return;
        try {
            await deleteMotion(committeeObj.id, motionId);
            // The onSnapshot listener will automatically update the UI after deletion
        } catch (err) {
            console.error('Failed to delete motion:', err);
            alert('Failed to delete motion: ' + err.message);
        }
    }

    async function handleCloseMotionVoting(motionId) {
        if (!window.confirm('Are you sure you want to close voting for this motion?')) return;
        try {
            await closeMotionVoting(committeeObj.id, motionId);
        } catch (err) {
            console.error('Failed to close voting for motion:', err);
            alert('Failed to close voting for motion: ' + err.message);
        }
    }

    async function handleApproveMotion(motionId) {
        if (!window.confirm('Are you sure you want to approve this motion?')) return;
        try {
            await approveMotion(committeeObj.id, motionId);
        } catch (err) {
            console.error('Failed to approve motion:', err);
            alert('Failed to approve motion: ' + err.message);
        }
    }

    function performDelete() {
        // No localStorage: deletion is server-side only (caller should remove from server or rely on server sync)
        navigate('/home');
    }

    const isCommitteeOwner = auth.currentUser && committeeObj?.data?.ownerUid === auth.currentUser.uid;

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
                            <button className={`filter-btn ${motionFilter === 'approved' ? 'active' : ''}`} onClick={() => setMotionFilter('approved')}>Approved ({approvedCount})</button>
                            <button className={`filter-btn ${motionFilter === 'denied' ? 'active' : ''}`} onClick={() => setMotionFilter('denied')}>Denied ({deniedCount})</button>
                        </div>
                        <div className="motions-list">
                            {filteredMotions.length === 0 ? (
                                <div className="no-motions">No motions found.</div>
                            ) : (
                                filteredMotions.map((motion) => (
                                    <div key={motion.id} className="motion-card">
                                        <div className="motion-card-header">
                                            <div className="motion-card-title-wrap">
                                                <h3 className="motion-title">{motion.name}</h3>
                                                {motion.status === 'active' && (
                                                    <span className="motion-badge">Active</span>
                                                )}
                                            </div>
                                            <div className="motion-card-actions-top">
                                                {/* Close Voting removed: voting is closed when motion is approved/denied */}
                                                {(auth.currentUser?.uid === motion.creatorUid || isCommitteeOwner) && motion.status !== 'deleted' && (
                                                    <button className="delete-motion-btn" onClick={() => handleDeleteMotion(motion.id)}>Delete</button>
                                                )}
                                                {motion.status === 'closed' && isCommitteeOwner && (
                                                    <button className="approve-motion-btn" onClick={() => handleApproveMotion(motion.id)}>Approve</button>
                                                )}
                                            </div>
                                        </div>

                                        <p className="motion-desc">{motion.description}</p>

                                        <div className="motion-card-footer">
                                            <div className="motion-meta">
                                                <div className="motion-avatar">{(motion.creator || '').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}</div>
                                                <div className="motion-meta-text">
                                                    <div className="creator">{motion.creator}</div>
                                                    <div className="date">{motion.date}</div>
                                                </div>
                                            </div>
                                            <div className="motion-card-footer-right">
                                                <button className="view-details-btn" onClick={() => viewMotion(motion)}>View Details</button>
                                            </div>
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
                                            <td className="member-name">
                                                <div className="member-item">
                                                    <div className="member-avatar">
                                                        {member.photoURL ? (
                                                            <img src={member.photoURL} alt={member.displayName || 'avatar'} />
                                                        ) : (
                                                            <div className="avatar-initials">{(member.displayName || (member.uid === auth.currentUser?.uid ? auth.currentUser.displayName : member.uid) || '').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}</div>
                                                        )}
                                                    </div>
                                                    <div className="member-info">
                                                        <div className="member-main" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                            <div className="member-name-text">{member.displayName || (member.uid === auth.currentUser?.uid ? auth.currentUser.displayName : member.uid)}</div>
                                                        </div>
                                                        <div className="member-sub">
                                                            {member.email && <div className="member-email">{member.email}</div>}
                                                            {member.joinedAt && <div className="member-joined">Joined {member.joinedAt}</div>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="member-pos">
                                                {member.role && <div className="role-badge position-badge">{member.role === 'owner' ? 'Owner' : member.role}</div>}
                                            </td>
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
                            {/* Motion Type removed — all created motions use the default type */}
                            <div className="form-row">
                                <label className="form-label">Motion Title *</label>
                                <input name="title" type="text" required placeholder="e.g., Approve Budget for Q2 2024" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="form-input" />
                            </div>

                            <div className="form-row">
                                <label className="form-label">Motion Description *</label>
                                <textarea name="description" required placeholder="Provide a detailed description..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="form-textarea" />
                            </div>

                            <div className="form-row">
                                <label className="form-label">Vote Threshold</label>
                                <select name="voteThreshold" value={form.voteThreshold} onChange={(e) => setForm({ ...form, voteThreshold: e.target.value })} className="form-select">
                                    <option value="Simple Majority">Simple Majority (&gt;50% of votes cast)</option>
                                    <option value="Two-Thirds">Two-Thirds (≥66% of votes cast)</option>
                                    <option value="Unanimous">Unanimous (All 'Yes' votes)</option>
                                </select>
                            </div>

                            {/* Requires Discussion removed - all motions require discussion by default */}

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
                                    {/* Discussion Style removed - always offline */}
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