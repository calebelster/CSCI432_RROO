// File: src/Committee.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/Committee.css';
import {
    createMotion,
    deleteMotion,
    deleteCommittee,
    approveMotion,
    closeMotionVoting,
    generateUniqueInviteCode,
    setMemberRole,
    updateCommitteeSettings,
    recordDecision,
} from '../firebase/committees';
import CommitteeSettings from '../components/CommitteeSettings';
import { db, auth } from '../firebase/firebase';
import { useAuth } from '../contexts/authContexts';
import {
    collection,
    doc,
    getDocs,
    query,
    where,
    onSnapshot,
    getDoc,
} from 'firebase/firestore';

function formatDateSafe(value) {
    if (!value) return null;
    try {
        if (value.toDate && typeof value.toDate === 'function') {
            return value.toDate().toLocaleDateString();
        }
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
        return String(value);
    } catch {
        return String(value);
    }
}

export default function Committee() {
    const navigate = useNavigate();
    const location = useLocation();

    const getCommitteeName = () => {
        const params = new URLSearchParams(location.search);
        return params.get('name') || 'Board of Directors';
    };

    const [committeeName, setCommitteeName] = useState(getCommitteeName());
    const [committeeInfo, setCommitteeInfo] = useState({
        name: committeeName,
        description: '',
    });
    const [committeeObj, setCommitteeObj] = useState(null);
    const [committeeData, setCommitteeData] = useState({
        members: [],
        motions: [],
        meetings: [],
        decisions: [],
    });
    const [activeTab, setActiveTab] = useState('motions');
    const [motionFilter, setMotionFilter] = useState('active');
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({
        motionType: 'standard',
        title: '',
        description: '',
        voteThreshold: 'Simple Majority',
        requiresDiscussion: true,
        secondRequired: true,
        allowAnonymous: false,
        // `isSpecial` removed; use `motionType === 'special'` instead
        parentMotionId: null,
    });
    const [showInvite, setShowInvite] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [creatingMotion, setCreatingMotion] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [changingRoleFor, setChangingRoleFor] = useState(null);
    const [roleChangePending, setRoleChangePending] = useState(null);
    const [showRoleConfirm, setShowRoleConfirm] = useState(false);
    // Delete motion confirmation
    const [showDeleteMotionConfirm, setShowDeleteMotionConfirm] = useState(false);
    const [deleteTargetMotionId, setDeleteTargetMotionId] = useState(null);
    const [deleteTargetMotionName, setDeleteTargetMotionName] = useState('');
    const [settingsUpdatedAt, setSettingsUpdatedAt] = useState(0);
    const [showRecordDecision, setShowRecordDecision] = useState(false);
    const [recordDecisionMotion, setRecordDecisionMotion] = useState(null);
    const [decisionForm, setDecisionForm] = useState({
        summary: '',
        pros: '',
        cons: '',
        recordingUrl: '',
    });
    const [recordingDecision, setRecordingDecision] = useState(false);

    useEffect(() => {
        setCommitteeName(getCommitteeName());
    }, [location.search]);

    useEffect(() => {
        let unsubMembers = null;
        let unsubMotions = null;
        let unsubDecisions = null;

        async function lookup() {
            setCommitteeObj(null);
            setCommitteeData({ members: [], motions: [], meetings: [], decisions: [] });

            try {
                const q = query(
                    collection(db, 'committees'),
                    where('name', '==', committeeName)
                );
                const snaps = await getDocs(q);
                if (snaps.empty) {
                    setCommitteeInfo({ name: committeeName, description: '' });
                    setCommitteeData({ members: [], motions: [], meetings: [], decisions: [] });
                    return;
                }

                const docSnap = snaps.docs[0];
                const committeeId = docSnap.id;
                const data = docSnap.data();
                setCommitteeObj({ id: committeeId, data });
                setCommitteeInfo({ name: data.name, description: data.description });
                setInviteCode(data.inviteCode || '');

                // Members listener
                const membersCol = collection(db, 'committees', committeeId, 'members');
                unsubMembers = onSnapshot(membersCol, msnap => {
                    const rawMembers = msnap.docs.map(d => ({
                        uid: d.id,
                        ...d.data(),
                    }));

                    (async () => {
                        try {
                            const enriched = await Promise.all(
                                rawMembers.map(async m => {
                                    try {
                                        const userDoc = await getDoc(doc(db, 'users', m.uid));
                                        if (userDoc.exists()) {
                                            const ud = userDoc.data();
                                            const joinedSource = ud.createdAt || m.joinedAt || null;
                                            const joined = joinedSource
                                                ? formatDateSafe(joinedSource)
                                                : null;
                                            return {
                                                ...m,
                                                displayName: ud.displayName || m.displayName || null,
                                                email: ud.email || m.email || null,
                                                photoURL: ud.photoURL || m.photoURL || null,
                                                joinedAt: joined,
                                            };
                                        }
                                    } catch { }
                                    const joined = m.joinedAt ? formatDateSafe(m.joinedAt) : null;
                                    return { ...m, joinedAt: joined };
                                })
                            );

                            setCommitteeData(prev => ({
                                ...prev,
                                members: enriched,
                            }));
                        } catch {
                            const normalized = rawMembers.map(m => ({
                                ...m,
                                joinedAt: m.joinedAt ? formatDateSafe(m.joinedAt) : null,
                            }));
                            setCommitteeData(prev => ({
                                ...prev,
                                members: normalized,
                            }));
                        }
                    })();
                });

                // Motions listener
                const motionsCol = collection(
                    db,
                    'committees',
                    committeeId,
                    'motions'
                );
                unsubMotions = onSnapshot(motionsCol, msnap => {
                    const motions = msnap.docs
                        .map(d => {
                            const md = d.data();
                            return {
                                id: d.id,
                                name: md.title || md.name || 'Untitled Motion',
                                description: md.description || '',
                                creator:
                                    md.creatorDisplayName ||
                                    md.creatorUid ||
                                    md.creator ||
                                    '',
                                creatorUid: md.creatorUid,
                                date:
                                    md.createdAt && md.createdAt.toDate
                                        ? new Date(md.createdAt.toDate()).toLocaleDateString()
                                        : '',
                                status: md.status || 'active',
                                type: md.type || '',
                                kind: md.kind || 'standard',
                                threshold: md.threshold || md.voteThreshold || 'Simple Majority',
                                requiresDiscussion: !!md.requiresDiscussion,
                                secondRequired: !!md.secondRequired,
                                discussionStyle: md.discussionStyle || 'Offline',
                                anonymousVotes: !!md.anonymousVotes,
                                tally: md.tally || { yes: 0, no: 0, abstain: 0 },
                                parentMotionId: md.parentMotionId || null,
                                relatedTo: md.relatedTo || null,
                            };
                        })
                        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                    setCommitteeData(prev => ({ ...prev, motions }));
                });

                // Decisions listener
                const decisionsCol = collection(
                    db,
                    'committees',
                    committeeId,
                    'decisions'
                );
                unsubDecisions = onSnapshot(decisionsCol, dsnap => {
                    const decisions = dsnap.docs
                        .map(d => ({
                            id: d.id,
                            ...d.data(),
                            createdAt: d.data().createdAt
                                ? d.data().createdAt.toDate?.()?.toLocaleDateString?.() ||
                                String(d.data().createdAt)
                                : '',
                        }))
                        .sort((a, b) => {
                            const dateA = new Date(b.createdAt).getTime();
                            const dateB = new Date(a.createdAt).getTime();
                            return dateA - dateB;
                        });
                    setCommitteeData(prev => ({ ...prev, decisions }));
                });
            } catch (err) {
                console.warn('committee lookup failed', err);
            }
        }

        lookup();

        return () => {
            if (unsubMembers) unsubMembers();
            if (unsubMotions) unsubMotions();
            if (unsubDecisions) unsubDecisions();
        };
    }, [committeeName]);

    function openModal() {
        const defaults = committeeObj?.data?.settings || {};
        setForm(prev => ({
            ...prev,
            // Committee settings key changed names historically — accept either key
            secondRequired: (defaults.requireSecond ?? defaults.secondRequired) ?? prev.secondRequired,
            // Committee settings use `allowAnonymousVoting`; fall back to legacy `allowAnonymous` if present
            allowAnonymous: (defaults.allowAnonymousVoting ?? defaults.allowAnonymous) ?? prev.allowAnonymous,
            voteThreshold: defaults.defaultVoteThreshold ?? prev.voteThreshold,
        }));
        setShowModal(true);
    }

    function closeModal() {
        setShowModal(false);
        setForm({
            motionType: 'standard',
            title: '',
            description: '',
            voteThreshold: 'Simple Majority',
            requiresDiscussion: true,
            secondRequired: true,
            allowAnonymous: false,
            // isSpecial assignment removed
            parentMotionId: null,
        });
    }

    async function handleCreateMotion(e) {
        e.preventDefault();

        const motionPayload = {
            title: form.title || 'Untitled Motion',
            description: form.description || '',
            type:
                form.motionType === 'special'
                    ? 'Special Motion'
                    : form.motionType === 'overturn'
                        ? 'Overturn Motion'
                        : form.motionType === 'sub'
                            ? 'Sub-Motion'
                            : 'Main Motion',
            kind: form.motionType,
            threshold: form.voteThreshold,
            anonymousVotes: !!form.allowAnonymous,
            // Special motions should not allow discussion
            requiresDiscussion: form.motionType === 'special' ? false : form.requiresDiscussion,
            secondRequired: !!form.secondRequired,
            allowAnonymous: !!form.allowAnonymous,
            ...(form.motionType === 'sub' && { parentMotionId: form.parentMotionId }),
        };

        const committeeId = committeeObj?.id || committeeName;
        setCreatingMotion(true);
        let motionId = null;

        try {
            motionId = await createMotion(committeeId, motionPayload);
        } catch (err) {
            console.warn('createMotion failed:', err);
        } finally {
            setCreatingMotion(false);
        }

        if (!motionId) {
            const newMotion = {
                id: Date.now() + Math.floor(Math.random() * 10000),
                name: motionPayload.title,
                description: motionPayload.description,
                creator: 'You',
                date: new Date().toLocaleDateString(),
                status: 'active',
                kind: form.motionType,
                type: motionPayload.type,
                threshold: motionPayload.threshold,
                requiresDiscussion: motionPayload.requiresDiscussion,
                secondRequired: motionPayload.secondRequired,
                tally: { yes: 0, no: 0, abstain: 0 },
                parentMotionId: form.parentMotionId || null,
            };
            setCommitteeData(prev => ({
                ...prev,
                motions: [newMotion, ...(prev.motions || [])],
            }));
        }

        closeModal();
        setActiveTab('motions');
        setMotionFilter('active');
    }

    const filteredMotions = (committeeData.motions || []).filter(m => {
        if (motionFilter === 'all') return m.status !== 'deleted';
        if (motionFilter === 'active') {
            return (
                (m.status === 'active' || m.status === 'closed') &&
                m.status !== 'deleted'
            );
        }
        if (motionFilter === 'approved') return m.status === 'completed';
        if (motionFilter === 'denied') return m.status === 'denied';
        return false;
    });

    const allCount = (committeeData.motions || []).filter(
        m => m.status !== 'deleted'
    ).length;
    const activeCount = (committeeData.motions || []).filter(
        m =>
            (m.status === 'active' || m.status === 'closed') &&
            m.status !== 'deleted'
    ).length;
    const approvedCount = (committeeData.motions || []).filter(
        m => m.status === 'completed'
    ).length;
    const deniedCount = (committeeData.motions || []).filter(
        m => m.status === 'denied'
    ).length;

    function viewMotion(motion) {
        try {
            sessionStorage.setItem(
                'motion_' + motion.id,
                JSON.stringify({
                    ...motion,
                    committeeId: committeeObj?.id || committeeName,
                    creatorUid: motion.creatorUid,
                })
            );
        } catch (e) { }
        navigate(`/motions?id=${motion.id}`);
    }

    async function handleDeleteMotion(motionId) {
        // open confirmation modal instead of immediate deletion
        setDeleteTargetMotionId(motionId);
        setDeleteTargetMotionName(
            (committeeData.motions || []).find(m => m.id === motionId)?.name || ''
        );
        setShowDeleteMotionConfirm(true);
    }

    async function handleCloseMotionVoting(motionId) {
        if (
            !window.confirm('Are you sure you want to close voting for this motion?')
        )
            return;
        try {
            await closeMotionVoting(committeeObj.id, motionId);
        } catch (err) {
            console.error('Failed to close voting for motion:', err);
            alert('Failed to close voting for motion: ' + err.message);
        }
    }

    async function handleApproveMotion(motionId) {
        if (!window.confirm('Are you sure you want to approve this motion?'))
            return;
        try {
            await approveMotion(committeeObj.id, motionId);
        } catch (err) {
            console.error('Failed to approve motion:', err);
            alert('Failed to approve motion: ' + err.message);
        }
    }

    function openRecordDecisionModal(motion) {
        setRecordDecisionMotion(motion);
        setShowRecordDecision(true);
    }

    function closeRecordDecisionModal() {
        setShowRecordDecision(false);
        setRecordDecisionMotion(null);
        setDecisionForm({
            summary: '',
            pros: '',
            cons: '',
            recordingUrl: '',
        });
    }

    async function handleRecordDecision() {
        if (!recordDecisionMotion || !committeeObj?.id) return;

        setRecordingDecision(true);
        try {
            await recordDecision(committeeObj.id, recordDecisionMotion.id, {
                summary: decisionForm.summary,
                pros: decisionForm.pros
                    .split('\n')
                    .map(p => p.trim())
                    .filter(Boolean),
                cons: decisionForm.cons
                    .split('\n')
                    .map(c => c.trim())
                    .filter(Boolean),
                recordingUrl: decisionForm.recordingUrl || null,
            });
            alert('Decision recorded successfully');
            closeRecordDecisionModal();
        } catch (err) {
            console.error('recordDecision failed', err);
            alert(err.message || 'Failed to record decision');
        } finally {
            setRecordingDecision(false);
        }
    }

    function performDelete() {
        // perform actual deletion of committee from Firestore
        (async () => {
            try {
                if (committeeObj?.id) {
                    await deleteCommittee(committeeObj.id);
                }
            } catch (err) {
                console.error('Failed to delete committee:', err);
                alert('Failed to delete committee: ' + (err.message || err));
                return;
            }
            navigate('/home');
        })();
    }

    const { currentUser } = useAuth();
    const isCommitteeOwner = currentUser && committeeObj?.data?.ownerUid === currentUser.uid;
    const isChair =
        currentUser &&
        committeeData.members?.some(
            m => m.uid === currentUser.uid && m.role === 'chair'
        );
    const isOwnerOrChair = isCommitteeOwner || isChair;

    async function handleRegenerateCode() {
        if (!committeeObj?.id) return;
        try {
            const code = await generateUniqueInviteCode(committeeObj.id);
            setInviteCode(code);
        } catch (e) {
            console.error('Failed to regenerate invite code', e);
            alert('Could not regenerate invite code. Please try again.');
        }
    }

    const shareLink =
        inviteCode && window?.location
            ? `${window.location.origin}/join/${inviteCode}`
            : '';

    return (
        <div className="committee-container">
            <div className="committee-header-bar">
                <div className="committee-header-left">
                    <button className="back-btn" onClick={() => navigate('/home')}>
                        Back
                    </button>
                    <div>
                        <h1 id="committee-title">{committeeInfo.name}</h1>
                        <p id="committee-desc">{committeeInfo.description}</p>
                    </div>
                </div>
                <div className="committee-header-right">
                    <button className="invite-btn" onClick={() => setShowInvite(true)}>
                        Invite Members
                    </button>
                    <button className="new-motion-btn" onClick={openModal}>
                        <span className="plus">+</span> New Motion
                    </button>
                    <div className="more-container">
                        <button
                            className="more-btn"
                            onClick={() => setShowMenu(!showMenu)}
                        >
                            ⋯
                        </button>
                        {showMenu && (
                            <div className="more-menu-dropdown">
                                {isCommitteeOwner && (
                                    <button
                                        className="more-item"
                                        onClick={() => {
                                            setConfirmDelete(true);
                                            setShowMenu(false);
                                        }}
                                    >
                                        Delete Committee
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="tab-bar">
                <button
                    className={`tab ${activeTab === 'motions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('motions')}
                >
                    Motions
                </button>
                <button
                    className={`tab ${activeTab === 'members' ? 'active' : ''}`}
                    onClick={() => setActiveTab('members')}
                >
                    Members
                </button>
                <button
                    className={`tab ${activeTab === 'decisions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('decisions')}
                >
                    Decisions
                </button>
                {isOwnerOrChair && (
                    <button
                        className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        Settings
                    </button>
                )}
            </div>

            <div className="tab-content">
                {activeTab === 'motions' && (
                    <div className="motions-section">
                        <div className="motions-header">Motions</div>
                        <div className="motion-filters">
                            <button
                                className={`filter-btn ${motionFilter === 'all' ? 'active' : ''
                                    }`}
                                onClick={() => setMotionFilter('all')}
                            >
                                All ({allCount})
                            </button>
                            <button
                                className={`filter-btn ${motionFilter === 'active' ? 'active' : ''
                                    }`}
                                onClick={() => setMotionFilter('active')}
                            >
                                Active ({activeCount})
                            </button>
                            <button
                                className={`filter-btn ${motionFilter === 'approved' ? 'active' : ''
                                    }`}
                                onClick={() => setMotionFilter('approved')}
                            >
                                Approved ({approvedCount})
                            </button>
                            <button
                                className={`filter-btn ${motionFilter === 'denied' ? 'active' : ''
                                    }`}
                                onClick={() => setMotionFilter('denied')}
                            >
                                Denied ({deniedCount})
                            </button>
                        </div>
                        <div className="motions-list">
                            {filteredMotions.length === 0 ? (
                                <div className="no-motions">No motions found.</div>
                            ) : (
                                filteredMotions.map(motion => (
                                    <div key={motion.id} className="motion-card">
                                        <div className="motion-card-header">
                                            <div className="motion-card-title-wrap">
                                                <h3 className="motion-title">{motion.name}</h3>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    {motion.status === 'active' && (
                                                        <span className="motion-badge">Active</span>
                                                    )}
                                                    {motion.kind === 'special' && (
                                                        <span className="motion-badge special">Special</span>
                                                    )}
                                                    {motion.kind === 'sub' && (
                                                        <span className="motion-badge sub">Sub-Motion</span>
                                                    )}
                                                    {motion.kind === 'overturn' && (
                                                        <span className="motion-badge overturn">
                                                            Overturn
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="motion-card-actions-top">
                                                {auth.currentUser?.uid === motion.creatorUid &&
                                                    motion.status !== 'deleted' && (
                                                        <button
                                                            className="delete-motion-btn"
                                                            onClick={() => handleDeleteMotion(motion.id)}
                                                        >
                                                            Delete
                                                        </button>
                                                    )}
                                                {motion.status === 'closed' && isOwnerOrChair && (
                                                    <button
                                                        className="approve-motion-btn"
                                                        onClick={() => handleApproveMotion(motion.id)}
                                                    >
                                                        Approve
                                                    </button>
                                                )}
                                                {(motion.status === 'completed' || motion.status === 'approved') && isOwnerOrChair && (
                                                    <button
                                                        className="record-decision-btn"
                                                        onClick={() => openRecordDecisionModal(motion)}
                                                    >
                                                        Record Decision
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <p className="motion-desc">{motion.description}</p>
                                        <div className="motion-card-footer">
                                            <div className="motion-meta">
                                                <div className="motion-avatar">
                                                    {(motion.creator || '')
                                                        .split(' ')
                                                        .map(s => s[0])
                                                        .slice(0, 2)
                                                        .join('')
                                                        .toUpperCase()}
                                                </div>
                                                <div className="motion-meta-text">
                                                    <div className="creator">{motion.creator}</div>
                                                    <div className="date">{motion.date}</div>
                                                </div>
                                            </div>
                                            <div className="motion-card-footer-right">
                                                <button
                                                    className="view-details-btn"
                                                    onClick={() => viewMotion(motion)}
                                                >
                                                    View Details
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'members' && (
                    <div className="members-section">
                        <div className="members-header">Members</div>
                        <div className="members-list">
                            {(committeeData.members || []).map((member, idx) => {
                                const display =
                                    member.displayName ||
                                    member.email ||
                                    (member.uid === auth.currentUser?.uid
                                        ? auth.currentUser.displayName || auth.currentUser.email || 'You'
                                        : 'Member');

                                return (
                                    <div key={member.uid || idx} className="member-card">
                                        <div className="member-card-header">
                                            <div className="member-item">
                                                <div className="member-avatar">
                                                    {member.photoURL ? (
                                                        <img src={member.photoURL} alt={display} />
                                                    ) : (
                                                        <div className="avatar-initials">
                                                            {display
                                                                .split(' ')
                                                                .map(s => s[0])
                                                                .slice(0, 2)
                                                                .join('')
                                                                .toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="member-info">
                                                    <div className="member-main">
                                                        <div className="member-name-text">{display}</div>
                                                        <div className="member-role-badge">
                                                            {member.role === 'owner'
                                                                ? '👑 Owner'
                                                                : member.role === 'chair'
                                                                    ? '🔨 Chair'
                                                                    : 'Member'}
                                                        </div>
                                                    </div>
                                                    {member.email && (
                                                        <div className="member-email">📧 {member.email}</div>
                                                    )}
                                                    {member.joinedAt && (
                                                        <div className="member-joined">
                                                            Joined {member.joinedAt}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {(isCommitteeOwner || isChair) && (
                                                <div className="member-role-selector">
                                                    <select
                                                        value={member.role || 'member'}
                                                        disabled={changingRoleFor === member.uid}
                                                        onChange={(e) => {
                                                            const newRole = e.target.value;
                                                            if (!committeeObj?.id) return;

                                                            if (isChair && !isCommitteeOwner && newRole === 'owner') {
                                                                alert('Only the committee owner can assign ownership.');
                                                                return;
                                                            }

                                                            if (member.uid === currentUser?.uid && newRole !== 'owner') {
                                                                alert('You cannot demote yourself. Transfer ownership to another member first.');
                                                                return;
                                                            }

                                                            if ((member.role || 'member') === newRole) return;

                                                            setRoleChangePending({ member, newRole });
                                                            setShowRoleConfirm(true);
                                                        }}
                                                    >
                                                        {isCommitteeOwner && <option value="owner">Owner</option>}
                                                        <option value="chair">Chair</option>
                                                        <option value="member">Member</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && isOwnerOrChair && (
                    <div className="settings-section">
                        <CommitteeSettings
                            committeeId={committeeObj?.id}
                            currentSettings={committeeObj?.data?.settings || {}}
                            onUpdated={s => {
                                // optimistic update local committee object
                                setCommitteeObj(prev => prev ? { ...prev, data: { ...prev.data, settings: { ...prev.data.settings, ...s } } } : prev);
                                setSettingsUpdatedAt(Date.now());
                            }}
                        />
                    </div>
                )}

                {activeTab === 'decisions' && (
                    <div className="decisions-section">
                        <div className="decisions-header">Recorded Decisions</div>
                        <div className="decisions-list">
                            {(committeeData.decisions || []).length === 0 ? (
                                <div className="no-decisions">
                                    No decisions recorded yet.
                                </div>
                            ) : (
                                (committeeData.decisions || []).map(decision => {
                                    const relatedMotion = (committeeData.motions || []).find(
                                        m => m.id === decision.motionId
                                    );
                                    return (
                                        <div key={decision.id} className="decision-card">
                                            <div className="decision-header">
                                                <h3>
                                                    {relatedMotion?.name ||
                                                        `Motion ${decision.motionId}`}
                                                </h3>
                                                <div className="decision-date">
                                                    {decision.createdAt}
                                                </div>
                                            </div>
                                            <div className="decision-meta">
                                                <small>Recorded by {decision.recordedByName}</small>
                                            </div>
                                            {decision.summary && (
                                                <div className="decision-summary">
                                                    <strong>Summary:</strong>
                                                    <p>{decision.summary}</p>
                                                </div>
                                            )}
                                            {decision.pros && decision.pros.length > 0 && (
                                                <div className="decision-pros">
                                                    <strong>Pros:</strong>
                                                    <ul>
                                                        {decision.pros.map((pro, i) => (
                                                            <li key={i}>{pro}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {decision.cons && decision.cons.length > 0 && (
                                                <div className="decision-cons">
                                                    <strong>Cons:</strong>
                                                    <ul>
                                                        {decision.cons.map((con, i) => (
                                                            <li key={i}>{con}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {decision.discussionSnapshot &&
                                                    decision.discussionSnapshot &&
                                                    decision.discussionSnapshot.length > 0 && (
                                                        <div className="decision-discussion">
                                                            <strong>
                                                                Discussion ({decision.discussionSnapshot.length} comments)
                                                            </strong>
                                                            <ul className="discussion-list">
                                                                {decision.discussionSnapshot.map((c, i) => (
                                                                    <li key={i}>
                                                                        <div className="discussion-author">
                                                                            {c.authorDisplayName || c.authorUid || 'Member'}
                                                                            <span className="discussion-date">{c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</span>
                                                                        </div>
                                                                        <div className="discussion-text">{c.text}</div>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                            {decision.recordingUrl && (
                                                <div className="decision-recording">
                                                    <a
                                                        href={decision.recordingUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        View Recording
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            {showModal && (
                <div
                    className="modal-overlay"
                    onClick={e => {
                        if (
                            typeof e.target.className === 'string' &&
                            e.target.className.includes('modal-overlay')
                        ) {
                            closeModal();
                        }
                    }}
                >
                    <div className="modal-content">
                        <button className="modal-close" onClick={closeModal}>
                            &times;
                        </button>
                        <h2>Create New Motion</h2>
                        <p className="modal-sub">
                            Submit a new motion for committee consideration
                        </p>
                        <form
                            className="motion-form"
                            autoComplete="off"
                            onSubmit={handleCreateMotion}
                        >
                            <div className="form-row">
                                <label className="form-label">Motion Type</label>
                                <select
                                    value={form.motionType}
                                    onChange={e =>
                                        setForm({ ...form, motionType: e.target.value })
                                    }
                                    className="form-select"
                                >
                                    <option value="standard">Standard Motion</option>
                                    <option value="sub">Sub-Motion (Revision/Postpone)</option>
                                    <option value="overturn">
                                        Motion to Overturn Previous Decision
                                    </option>
                                    <option value="special">
                                        Special Motion (No Discussion)
                                    </option>
                                </select>
                            </div>

                            {form.motionType === 'sub' && (
                                <div className="form-row">
                                    <label className="form-label">Related Motion</label>
                                    <select
                                        value={form.parentMotionId || ''}
                                        onChange={e =>
                                            setForm({ ...form, parentMotionId: e.target.value })
                                        }
                                        className="form-select"
                                    >
                                        <option value="">Select a motion...</option>
                                        {(committeeData.motions || [])
                                            .filter(m => m.status !== 'deleted')
                                            .map(m => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            )}

                            <div className="form-row">
                                <label className="form-label">Motion Title</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g., Approve Budget for Q2 2024"
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                    className="form-input"
                                />
                            </div>

                            <div className="form-row">
                                <label className="form-label">Motion Description</label>
                                <textarea
                                    required
                                    placeholder="Provide a detailed description..."
                                    value={form.description}
                                    onChange={e =>
                                        setForm({ ...form, description: e.target.value })
                                    }
                                    className="form-textarea"
                                />
                            </div>

                            <>
                                <div className="form-row">
                                    <label className="form-label">Vote Threshold</label>
                                    <select
                                        value={form.voteThreshold}
                                        onChange={e =>
                                            setForm({ ...form, voteThreshold: e.target.value })
                                        }
                                        className="form-select"
                                    >
                                        <option value="Simple Majority">
                                            Simple Majority (&gt;50% of votes cast)
                                        </option>
                                        <option value="Two-Thirds">
                                            Two-Thirds (≈66% of votes)
                                        </option>
                                        <option value="Unanimous">
                                            Unanimous (All Yes)
                                        </option>
                                    </select>
                                </div>

                                <div className="committee-settings">
                                    <div className="settings-title">Motion Settings</div>
                                    <div className="settings-list">
                                        <div className="form-row">
                                            <label className="form-label">Second Required</label>
                                            <label className="switch">
                                                <input
                                                    type="checkbox"
                                                    checked={form.secondRequired}
                                                    onChange={e =>
                                                        setForm({
                                                            ...form,
                                                            secondRequired: e.target.checked,
                                                        })
                                                    }
                                                />
                                                <span className="switch-slider" />
                                            </label>
                                        </div>
                                        <div className="form-row">
                                            <label className="form-label">
                                                Allow Anonymous Voting
                                            </label>
                                            <label className="switch">
                                                <input
                                                    type="checkbox"
                                                    checked={form.allowAnonymous}
                                                    onChange={e =>
                                                        setForm({
                                                            ...form,
                                                            allowAnonymous: e.target.checked,
                                                        })
                                                    }
                                                />
                                                <span className="switch-slider" />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </>

                            {form.motionType === 'special' && (
                                <div className="form-row">
                                    <small>
                                        Special motions cannot be discussed and proceed directly to
                                        voting.
                                    </small>
                                </div>
                            )}

                            <div className="form-actions">
                                <button
                                    type="submit"
                                    className="modal-create"
                                    disabled={creatingMotion}
                                >
                                    {creatingMotion ? 'Creating...' : 'Create Motion'}
                                </button>
                                <button
                                    type="button"
                                    className="modal-cancel"
                                    onClick={closeModal}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {confirmDelete && (
                <div
                    className="confirm-overlay"
                    onClick={e => {
                        if (
                            typeof e.target.className === 'string' &&
                            e.target.className.includes('confirm-overlay')
                        ) {
                            setConfirmDelete(false);
                        }
                    }}
                >
                    <div className="confirm-content">
                        <h3>Delete committee?</h3>
                        <p>
                            Are you sure you want to delete &quot;{committeeName}&quot;? This
                            will remove all local data for this committee.
                        </p>
                        <div className="confirm-actions">
                            <button
                                className="confirm-cancel"
                                onClick={() => setConfirmDelete(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="confirm-delete"
                                onClick={() => {
                                    setConfirmDelete(false);
                                    performDelete();
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteMotionConfirm && (
                <div
                    className="confirm-overlay"
                    onClick={e => {
                        if (
                            typeof e.target.className === 'string' &&
                            e.target.className.includes('confirm-overlay')
                        ) {
                            setShowDeleteMotionConfirm(false);
                            setDeleteTargetMotionId(null);
                            setDeleteTargetMotionName('');
                        }
                    }}
                >
                    <div className="confirm-content">
                        <h3>Delete motion?</h3>
                        <p>
                            Are you sure you want to delete <strong>{deleteTargetMotionName || deleteTargetMotionId}</strong>?
                            This will mark the motion as deleted and it will no longer be available.
                        </p>
                        <div className="confirm-actions">
                            <button
                                className="confirm-cancel"
                                onClick={() => {
                                    setShowDeleteMotionConfirm(false);
                                    setDeleteTargetMotionId(null);
                                    setDeleteTargetMotionName('');
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="confirm-delete"
                                onClick={async () => {
                                    if (!deleteTargetMotionId) return;
                                    setShowDeleteMotionConfirm(false);
                                    try {
                                        await deleteMotion(committeeObj.id, deleteTargetMotionId);
                                    } catch (err) {
                                        console.error('Failed to delete motion:', err);
                                        alert('Failed to delete motion: ' + (err?.message || err));
                                    } finally {
                                        setDeleteTargetMotionId(null);
                                        setDeleteTargetMotionName('');
                                    }
                                }}
                            >
                                Delete Motion
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showRoleConfirm && roleChangePending && (
                <div
                    className="confirm-overlay"
                    onClick={e => {
                        if (
                            typeof e.target.className === 'string' &&
                            e.target.className.includes('confirm-overlay')
                        ) {
                            setShowRoleConfirm(false);
                            setRoleChangePending(null);
                        }
                    }}
                >
                    <div className="confirm-content">
                        <h3>Change Role?</h3>
                        <p>
                            Change role for <strong>{roleChangePending.member.displayName || roleChangePending.member.email || roleChangePending.member.uid}</strong>
                            {' '}from <strong>{roleChangePending.member.role || 'member'}</strong> to <strong>{roleChangePending.newRole}</strong>?
                        </p>
                        {roleChangePending.newRole === 'owner' && (
                            <p style={{ color: '#a00' }}>
                                You are transferring ownership. The previous owner will be demoted to member.
                            </p>
                        )}
                        <div className="confirm-actions">
                            <button
                                className="confirm-cancel"
                                onClick={() => {
                                    setShowRoleConfirm(false);
                                    setRoleChangePending(null);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="confirm-delete"
                                onClick={async () => {
                                    const { member, newRole } = roleChangePending;
                                    setShowRoleConfirm(false);
                                    setChangingRoleFor(member.uid);
                                    try {
                                        await setMemberRole(committeeObj.id, member.uid, newRole);

                                        // optimistic local update of members
                                        setCommitteeData(prev => ({
                                            ...prev,
                                            members: (prev.members || []).map(m =>
                                                m.uid === member.uid ? { ...m, role: newRole } : m
                                            ),
                                        }));

                                        // if ownership transferred, update local committee owner immediately
                                        if (newRole === 'owner') {
                                            setCommitteeObj(prev =>
                                                prev ? { ...prev, data: { ...prev.data, ownerUid: member.uid } } : prev
                                            );
                                        }
                                    } catch (err) {
                                        console.error('Failed to change role', err);
                                        alert('Failed to change role: ' + err.message);
                                    } finally {
                                        setChangingRoleFor(null);
                                        setRoleChangePending(null);
                                    }
                                }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showRecordDecision && recordDecisionMotion && (
                <div
                    className="modal-overlay"
                    onClick={e => {
                        if (
                            typeof e.target.className === 'string' &&
                            e.target.className.includes('modal-overlay')
                        ) {
                            closeRecordDecisionModal();
                        }
                    }}
                >
                    <div className="modal-content">
                        <button
                            className="modal-close"
                            onClick={closeRecordDecisionModal}
                        >
                            &times;
                        </button>
                        <h2>Record Decision</h2>
                        <p className="modal-sub">
                            Document the decision for motion: {recordDecisionMotion.name}
                        </p>
                        <div className="decision-form">
                            <div className="form-row">
                                <label className="form-label">Summary</label>
                                <textarea
                                    value={decisionForm.summary}
                                    onChange={e =>
                                        setDecisionForm({
                                            ...decisionForm,
                                            summary: e.target.value,
                                        })
                                    }
                                    placeholder="Brief summary of the decision"
                                    rows={4}
                                    className="form-textarea"
                                />
                            </div>

                            <div className="form-row">
                                <label className="form-label">Pros (one per line)</label>
                                <textarea
                                    value={decisionForm.pros}
                                    onChange={e =>
                                        setDecisionForm({
                                            ...decisionForm,
                                            pros: e.target.value,
                                        })
                                    }
                                    placeholder="List pros of this decision"
                                    rows={3}
                                    className="form-textarea"
                                />
                            </div>

                            <div className="form-row">
                                <label className="form-label">Cons (one per line)</label>
                                <textarea
                                    value={decisionForm.cons}
                                    onChange={e =>
                                        setDecisionForm({
                                            ...decisionForm,
                                            cons: e.target.value,
                                        })
                                    }
                                    placeholder="List cons of this decision"
                                    rows={3}
                                    className="form-textarea"
                                />
                            </div>

                            <div className="form-row">
                                <label className="form-label">Recording URL (optional)</label>
                                <input
                                    type="url"
                                    value={decisionForm.recordingUrl}
                                    onChange={e =>
                                        setDecisionForm({
                                            ...decisionForm,
                                            recordingUrl: e.target.value,
                                        })
                                    }
                                    placeholder="https://..."
                                    className="form-input"
                                />
                            </div>

                            <div className="form-actions">
                                <button
                                    type="button"
                                    className="modal-create"
                                    onClick={handleRecordDecision}
                                    disabled={recordingDecision}
                                >
                                    {recordingDecision ? 'Recording...' : 'Record Decision'}
                                </button>
                                <button
                                    type="button"
                                    className="modal-cancel"
                                    onClick={closeRecordDecisionModal}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showInvite && (
                <div
                    className="invite-overlay"
                    onClick={e => {
                        if (
                            typeof e.target.className === 'string' &&
                            e.target.className.includes('invite-overlay')
                        ) {
                            setShowInvite(false);
                        }
                    }}
                >
                    <div className="invite-content">
                        <button
                            className="modal-close"
                            onClick={() => setShowInvite(false)}
                        >
                            &times;
                        </button>
                        <h3>Invite Members</h3>
                        <p>
                            Share a link to this committee or give collaborators the invite
                            code.
                        </p>

                        {isCommitteeOwner && (
                            <div className="invite-row">
                                <label>Invite Code</label>
                                <div className="invite-box">
                                    <input readOnly value={inviteCode || 'No code yet'} />
                                    <button onClick={handleRegenerateCode}>
                                        {inviteCode ? 'Regenerate' : 'Generate'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="invite-row">
                            <label>Shareable Link</label>
                            <div className="invite-box">
                                <input
                                    readOnly
                                    value={
                                        inviteCode
                                            ? shareLink
                                            : 'Generate a code first (owner only)'
                                    }
                                />
                                <button
                                    disabled={!inviteCode}
                                    onClick={() =>
                                        inviteCode && navigator.clipboard?.writeText(shareLink)
                                    }
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}