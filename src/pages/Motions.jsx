// File: src/Motions.jsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/Motions.css';
import {
    replyToMotion,
    castVote,
    approveMotion,
    closeMotionVoting,
    denyMotion,
    recordDecision,
    proposeOverturn,
} from '../firebase/committees';
import { db, auth } from '../firebase/firebase';
import {
    collection,
    onSnapshot,
    doc,
    getDocs,
    getDoc,
} from 'firebase/firestore';

export default function Motions() {
    const location = useLocation();
    const navigate = useNavigate();

    const [motions, setMotions] = useState([]);
    const [actionMessage, setActionMessage] = useState(null); // {text, variant}
    const [replyInputs, setReplyInputs] = useState({});
    const [replyStances, setReplyStances] = useState({});
    const [committeeOwnerUid, setCommitteeOwnerUid] = useState(null);
    const [committeeMemberRole, setCommitteeMemberRole] = useState(null);
    const [ownerActionDisabled, setOwnerActionDisabled] = useState({});
    const [selectedTab, setSelectedTab] = useState('overview');

    // anonymous vote choice is determined per-motion by `motion.anonymousVotes`
    const [showRecordDecision, setShowRecordDecision] = useState(false);
    const [decisionForm, setDecisionForm] = useState({
        summary: '',
        pros: '',
        cons: '',
        recordingUrl: '',
    });
    const [recordingDecision, setRecordingDecision] = useState(false);
    const [showDenyConfirm, setShowDenyConfirm] = useState(false);
    const [denyTargetMotionId, setDenyTargetMotionId] = useState(null);

    const VOTE_LABELS = { yes: 'Yes', no: 'No', abstain: 'Abstain' };

    // derive motion id and committee id from query/session
    useEffect(() => {
        let cid = null;
        const params = new URLSearchParams(location.search);
        const motionId = params.get('id');

        try {
            const raw = sessionStorage.getItem('motion_' + motionId);
            if (raw) {
                const parsed = JSON.parse(raw);
                cid = parsed.committeeId || parsed.cid || null;
            }
        } catch {
            cid = null;
        }

        if (!cid) {
            setMotions([]);
            return;
        }

        (async () => {
            try {
                const committeeDoc = await getDoc(doc(db, 'committees', cid));
                if (committeeDoc.exists()) {
                    setCommitteeOwnerUid(committeeDoc.data().ownerUid);
                    // fetch current user's member role in this committee (if signed in)
                    try {
                        const uid = auth?.currentUser?.uid;
                        if (uid) {
                            const memberSnap = await getDoc(
                                doc(db, 'committees', cid, 'members', uid)
                            );
                            if (memberSnap.exists()) {
                                setCommitteeMemberRole(memberSnap.data().role || null);
                            } else {
                                setCommitteeMemberRole(null);
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            } catch (e) {
                console.error('Failed to fetch committee owner', e);
            }
        })();

        const motionsCol = collection(db, 'committees', cid, 'motions');

        const unsub = onSnapshot(
            motionsCol,
            async snap => {
                const raw = snap.docs.map(d => {
                    const md = d.data();
                    return {
                        id: d.id,
                        title: md.title || md.name || 'Untitled Motion',
                        description: md.description || '',
                        creator: md.creatorDisplayName || md.creatorUid || md.creator || '',
                        creatorDisplayName: md.creatorDisplayName,
                        creatorUid: md.creatorUid || null,
                        status: md.status || 'active',
                        replies: md.replies,
                        tally: md.tally || { yes: 0, no: 0, abstain: 0 },
                        threshold: md.threshold || md.voteThreshold || 'Simple Majority',
                        createdAt: md.createdAt || md.created || md.createdat || null,
                        kind: md.kind || 'standard',
                        requiresDiscussion:
                            md.requiresDiscussion !== undefined
                                ? !!md.requiresDiscussion
                                : true,
                        parentMotionId: md.parentMotionId || null,
                        relatedTo: md.relatedTo || null,
                        anonymousVotes: !!md.anonymousVotes,
                        voteThreshold: md.voteThreshold || md.threshold || 'Simple Majority',
                    };
                });

                const repliesByMotion = {};
                const votesByMotion = {};

                try {
                    await Promise.all(
                        raw.map(async m => {
                            try {
                                const repliesSnap = await getDocs(
                                    collection(db, 'committees', cid, 'motions', m.id, 'replies')
                                );
                                repliesByMotion[m.id] = repliesSnap.docs.map(r => ({
                                    id: r.id,
                                    ...r.data(),
                                }));
                            } catch {
                                repliesByMotion[m.id] = m.replies || [];
                            }

                            try {
                                const votesSnap = await getDocs(
                                    collection(db, 'committees', cid, 'motions', m.id, 'votes')
                                );
                                votesByMotion[m.id] = votesSnap.docs.map(v => ({
                                    id: v.id,
                                    ...v.data(),
                                }));
                            } catch {
                                votesByMotion[m.id] = [];
                            }
                        })
                    );

                    const uidSet = new Set(
                        raw.map(m => m.creatorUid).filter(Boolean)
                    );
                    Object.values(repliesByMotion).forEach(list =>
                        list.forEach(r => r.authorUid && uidSet.add(r.authorUid))
                    );
                    Object.values(votesByMotion).forEach(list =>
                        list.forEach(v => v.voterUid && uidSet.add(v.voterUid))
                    );
                    const uids = Array.from(uidSet);

                    const profiles = {};
                    await Promise.all(
                        uids.map(async uid => {
                            try {
                                const userDoc = await getDoc(doc(db, 'users', uid));
                                if (userDoc.exists()) profiles[uid] = userDoc.data();
                            } catch {
                                // ignore
                            }
                        })
                    );

                    let docs = raw.map(m => {
                        const displayName =
                            m.creatorDisplayName ||
                            (m.creatorUid && profiles[m.creatorUid]?.displayName) ||
                            m.creator;
                        return {
                            id: m.id,
                            title: m.title,
                            description: m.description,
                            creator: displayName || m.creatorUid || 'Member',
                            creatorUid: m.creatorUid,
                            status: m.status,
                            replies: repliesByMotion[m.id] || m.replies || [],
                            votes: votesByMotion[m.id] || [],
                            tally: m.tally,
                            threshold: m.threshold,
                            createdAt: m.createdAt,
                            kind: m.kind,
                            requiresDiscussion: m.requiresDiscussion,
                            parentMotionId: m.parentMotionId,
                            relatedTo: m.relatedTo,
                            anonymousVotes: m.anonymousVotes,
                        };
                    });

                    const params2 = new URLSearchParams(location.search);
                    const idFilter = params2.get('id');
                    if (idFilter) docs = docs.filter(m => m.id === idFilter);

                    docs.sort((a, b) => b.id.localeCompare(a.id));
                    setMotions(docs);
                } catch (e) {
                    console.warn('motions listener failed, using raw list', e);
                    let docs = raw.map(m => ({
                        id: m.id,
                        title: m.title,
                        description: m.description,
                        creator: m.creator || m.creatorUid || 'Member',
                        status: m.status,
                        replies: m.replies || [],
                        votes: [],
                        tally: m.tally,
                        threshold: m.threshold,
                        createdAt: m.createdAt,
                        kind: m.kind,
                        requiresDiscussion: m.requiresDiscussion,
                        parentMotionId: m.parentMotionId,
                        relatedTo: m.relatedTo,
                        anonymousVotes: m.anonymousVotes,
                    }));
                    const params2 = new URLSearchParams(location.search);
                    const idFilter = params2.get('id');
                    if (idFilter) docs = docs.filter(m => m.id === idFilter);
                    docs.sort((a, b) => b.id.localeCompare(a.id));
                    setMotions(docs);
                }
            },
            err => {
                console.warn('motions listener failed', err);
            }
        );

        return () => unsub();
    }, [location.search]);

    const isCommitteeOwner = auth.currentUser?.uid === committeeOwnerUid;
    const isChair = committeeMemberRole === 'chair';
    const isOwnerOrChair = isCommitteeOwner || isChair;

    function evaluateThreshold(m) {
        const yes = m.tally?.yes || 0;
        const no = m.tally?.no || 0;
        const abstain = m.tally?.abstain || 0;
        const total = yes + no + abstain;
        const thrRaw = (m.threshold || m.voteThreshold || 'Simple Majority')
            .toString()
            .toLowerCase();
        let required = 0;
        let passing = false;

        if (total === 0) {
            required = 1;
            passing = false;
        } else if (thrRaw.includes('two')) {
            required = Math.ceil((2 / 3) * total);
            passing = yes >= required;
        } else if (thrRaw.includes('unanim')) {
            required = total;
            passing = yes === total && total > 0;
        } else {
            required = Math.floor(total / 2) + 1;
            passing = yes >= required;
        }

        return { yes, no, abstain, total, required, passing };
    }

    function resolveCommitteeId(motionId) {
        try {
            const params = new URLSearchParams(location.search);
            const cidFromUrl = params.get('cid');
            if (cidFromUrl) return cidFromUrl;
        } catch {}

        try {
            const raw = sessionStorage.getItem('motion_' + motionId);
            if (raw) {
                const parsed = JSON.parse(raw);
                return parsed.committeeId || parsed.cid || null;
            }
        } catch {
            return null;
        }
        return null;
    }

    function getStatusInfo(m) {
        const raw = (m.status || '').toString().toLowerCase();
        if (raw.includes('den')) return { key: 'denied', label: 'Denied' };
        if (raw.includes('app') || raw.includes('completed')) {
            return { key: 'approved', label: 'Approved' };
        }
        if (raw.includes('clos') || raw.includes('completed')) {
            try {
                const ev = evaluateThreshold(m);
                return ev.passing
                    ? { key: 'approved', label: 'Approved' }
                    : { key: 'denied', label: 'Denied' };
            } catch {
                return { key: 'denied', label: 'Denied' };
            }
        }
        return { key: 'active', label: 'Active' };
    }

    async function handleApproveMotion(motionId) {
        if (!window.confirm('Are you sure you want to approve this motion?')) return;
        try {
            setOwnerActionDisabled(prev => ({ ...prev, [motionId]: true }));
            const cid = resolveCommitteeId(motionId);
            if (cid) {
                await approveMotion(cid, motionId);
                setActionMessage({ text: 'Motion approved', variant: 'success' });
                setTimeout(() => setActionMessage(null), 3500);
            } else {
                alert('Committee ID not found for approving motion.');
            }
        } catch (err) {
            console.error('Failed to approve motion', err);
            setActionMessage({ text: 'Failed to approve', variant: 'error' });
            setOwnerActionDisabled(prev => ({ ...prev, [motionId]: false }));
        }
    }

    async function handleDenyMotion(motionId) {
        try {
            setOwnerActionDisabled(prev => ({ ...prev, [motionId]: true }));
            const cid = resolveCommitteeId(motionId);
            if (cid) {
                await denyMotion(cid, motionId);
                setActionMessage({ text: 'Motion denied', variant: 'error' });
                setTimeout(() => setActionMessage(null), 3500);
            } else {
                alert('Committee ID not found for denying motion.');
            }
        } catch (err) {
            console.error('Failed to deny motion', err);
            setActionMessage({ text: 'Failed to deny', variant: 'error' });
        } finally {
            setOwnerActionDisabled(prev => ({ ...prev, [motionId]: false }));
            // clear any pending deny target
            if (denyTargetMotionId === motionId) {
                setDenyTargetMotionId(null);
                setShowDenyConfirm(false);
            }
        }
    }

    function requestDenyMotion(motionId) {
        setDenyTargetMotionId(motionId);
        setShowDenyConfirm(true);
    }

    async function handleCloseMotionVoting(motionId) {
        if (
            !window.confirm('Are you sure you want to close voting for this motion?')
        )
            return;
        try {
            const params = new URLSearchParams(location.search);
            const cid = params.get('cid') || resolveCommitteeId(motionId);
            if (cid) {
                await closeMotionVoting(cid, motionId);
            } else {
                alert('Committee ID not found for closing motion voting.');
            }
        } catch (err) {
            console.error('Failed to close voting for motion', err);
            alert('Failed to close voting for motion: ' + err.message);
        }
    }

    function handleInputChange(id, value) {
        setReplyInputs(prev => ({ ...prev, [id]: value }));
    }

    function handleStanceChange(id, value) {
        setReplyStances(prev => ({ ...prev, [id]: value }));
    }

    async function addReply(motionId) {
        const text = (replyInputs[motionId] || '').trim();
        if (!text) return;
        const stance = replyStances[motionId] || 'pro';

        let committeeId = null;
        try {
            const raw = sessionStorage.getItem('motion_' + motionId);
            if (raw) {
                const parsed = JSON.parse(raw);
                committeeId = parsed.committeeId || null;
            }
        } catch {
            committeeId = null;
        }

        if (committeeId) {
            try {
                await replyToMotion(committeeId, motionId.toString(), {
                    text,
                    stance,
                });
            } catch (err) {
                console.warn('replyToMotion failed', err);
            }
        }

        const currentUserName =
            auth?.currentUser?.displayName ||
            auth?.currentUser?.email ||
            auth?.currentUser?.uid ||
            'You';
        const currentUserUid = auth?.currentUser?.uid || null;

        const localReply = {
            user: currentUserName,
            authorUid: currentUserUid,
            text,
            stance,
            createdAt: new Date(),
        };

        setMotions(prev =>
            prev.map(m =>
                m.id === motionId
                    ? { ...m, replies: [...(m.replies || []), localReply] }
                    : m
            )
        );
        setReplyInputs(prev => ({ ...prev, [motionId]: '' }));
        setReplyStances(prev => ({ ...prev, [motionId]: 'pro' }));
    }

    async function vote(committeeId, motionId, choice, anonymousFlag) {
        let cid = committeeId;
        if (!cid) {
            try {
                const raw = sessionStorage.getItem('motion_' + motionId);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    cid = parsed.committeeId || null;
                }
            } catch {
                cid = null;
            }
        }
        if (!cid) {
            setActionMessage({
                text: 'Committee ID not found for this motion.',
                variant: 'error',
            });
            setTimeout(() => setActionMessage(null), 3500);
            return;
        }

        try {
            const anonymous = !!anonymousFlag;
            await castVote(cid, motionId.toString(), {
                choice,
                anonymous,
            });
            setActionMessage({
                text: `Vote recorded${anonymous ? ' (anonymous)' : ''}`,
                variant: 'success',
            });
            setTimeout(() => setActionMessage(null), 3500);
        } catch (err) {
            console.error('castVote failed', err);
            setActionMessage({
                text: err?.message || 'Failed to cast vote',
                variant: 'error',
            });
            setTimeout(() => setActionMessage(null), 3500);
        }
    }

    async function handleRecordDecision(motion) {
        const cid = resolveCommitteeId(motion.id);
        if (!cid) {
            setActionMessage({
                text: 'Committee ID not found',
                variant: 'error',
            });
            setTimeout(() => setActionMessage(null), 3500);
            return;
        }

        setRecordingDecision(true);
        try {
            await recordDecision(cid, motion.id, {
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
            setActionMessage({
                text: 'Decision recorded successfully',
                variant: 'success',
            });
            setTimeout(() => setActionMessage(null), 3500);
            setShowRecordDecision(false);
            setDecisionForm({
                summary: '',
                pros: '',
                cons: '',
                recordingUrl: '',
            });
        } catch (err) {
            console.error('recordDecision failed', err);
            setActionMessage({
                text: err.message || 'Failed to record decision',
                variant: 'error',
            });
            setTimeout(() => setActionMessage(null), 3500);
        } finally {
            setRecordingDecision(false);
        }
    }

    async function handleProposeOverturn(motion) {
        const cid = resolveCommitteeId(motion.id);
        if (!cid) {
            alert('Committee ID not found');
            return;
        }
        const title = window.prompt('Title for overturn motion:');
        if (!title) return;
        const description = window.prompt('Description for overturn motion:');
        if (!description) return;

        try {
            await proposeOverturn(cid, motion.id, { title, description });
            setActionMessage({
                text: 'Overturn motion proposed successfully',
                variant: 'success',
            });
            setTimeout(() => setActionMessage(null), 3500);
        } catch (err) {
            console.error('proposeOverturn failed', err);
            setActionMessage({
                text: err.message || 'Failed to propose overturn',
                variant: 'error',
            });
            setTimeout(() => setActionMessage(null), 3500);
        }
    }

    useEffect(() => {
        try {
            const params = new URLSearchParams(location.search);
            const id = params.get('id');
            if (id) {
                const el = document.getElementById('motion-' + id);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('focused-motion');
                    setTimeout(() => el.classList.remove('focused-motion'), 2200);
                }
            }
        } catch {}
    }, [location.search]);

    function formatDateField(value) {
        if (!value) return '';
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

    const params = new URLSearchParams(location.search);
    const motionIdParam = params.get('id');
    const isDetailView = motionIdParam && motions.length === 1;

    if (isDetailView && motions.length === 1) {
        const motion = motions[0];
        const statusInfo = getStatusInfo(motion);
        const isFinalStatus =
            statusInfo.key === 'approved' || statusInfo.key === 'denied';

        const createdAtLabel = formatDateField(
            motion.createdAt || motion.created || motion.createdat
        );

        const supportingOpposingCounts = (() => {
            const counts = { supporting: 0, opposing: 0, neutral: 0 };
            (motion.replies || []).forEach(r => {
                const s = (r.stance || r.position || 'neutral')
                    .toString()
                    .toLowerCase();
                if (['pro', 'support', 'supporting'].includes(s)) counts.supporting++;
                else if (['con', 'oppose', 'opposing', 'against'].includes(s))
                    counts.opposing++;
                else counts.neutral++;
            });
            return counts;
        })();

        const { yes, no, abstain, total, required, passing } =
            evaluateThreshold(motion);
        const disabledFlag = !!ownerActionDisabled[motion.id];

        return (
            <div className="motions-page motion-detail">
                <button
                    className="back-button"
                    onClick={() => navigate(-1)}
                    aria-label="Back to Motions"
                >
                    <span className="back-arrow" />
                    <span className="back-label">Back</span>
                </button>

                <div className="detail-top">
                    <div className="detail-title">
                        <h1>{motion.title}</h1>
                        <p className="subtitle">
                            {motion.description || 'Motion details and timeline'}
                        </p>
                    </div>
                    <div className="detail-actions">
                        <span className="role-badge">Member</span>
                    </div>
                </div>

                {actionMessage && (
                    <div className={`action-toast ${actionMessage.variant}`}>
                        <span className="action-toast-text">{actionMessage.text}</span>
                        <button
                            className="action-toast-close"
                            onClick={() => setActionMessage(null)}
                        >
                            ×
                        </button>
                    </div>
                )}

                <div className="tabs" role="tablist">
                    <button
                        aria-selected={selectedTab === 'overview'}
                        onClick={() => setSelectedTab('overview')}
                        className={`tab ${selectedTab === 'overview' ? 'active' : ''}`}
                    >
                        Overview
                    </button>
                    {motion.requiresDiscussion && (
                        <button
                            aria-selected={selectedTab === 'discussion'}
                            onClick={() => setSelectedTab('discussion')}
                            className={`tab ${
                                selectedTab === 'discussion' ? 'active' : ''
                            }`}
                        >
                            Discussion
                        </button>
                    )}
                    <button
                        aria-selected={selectedTab === 'voting'}
                        onClick={() => setSelectedTab('voting')}
                        className={`tab ${selectedTab === 'voting' ? 'active' : ''}`}
                    >
                        Voting
                    </button>
                </div>

                <div className="cards-row">
                    <div className="card small-card">
                        <div className="card-label">Author</div>
                        <div className="card-body">
                            <div className="avatar">
                                {(motion.creator || 'M')
                                    .split(' ')
                                    .map(n => n[0])
                                    .slice(0, 2)
                                    .join('')}
                            </div>
                            <div className="card-name">{motion.creator}</div>
                            <div className="card-sub">
                                {createdAtLabel ? `Created ${createdAtLabel}` : ''}
                            </div>
                        </div>
                    </div>

                    <div className="card timeline-card">
                        <div className="card-label">Timeline</div>
                        <div className="card-body timeline-body">
                            <div>
                                <strong>Created</strong> {createdAtLabel}
                            </div>
                            <div>
                                <strong>Status</strong> {statusInfo.label}
                            </div>
                            <div>
                                <strong>Threshold</strong> {motion.threshold || 'Simple majority required to pass'}
                            </div>
                        </div>
                    </div>
                </div>

                {selectedTab === 'overview' && (
                    <div className="motion-details-box">
                        <h3>Motion Details</h3>
                        <div className="details-grid">
                            <div>
                                <strong>Description</strong>
                                <div>{motion.description}</div>
                            </div>
                            <div>
                                <strong>Status</strong>
                                <div>{motion.status}</div>
                            </div>
                            <div>
                                <strong>Vote Threshold</strong>
                                <div>{motion.threshold}</div>
                            </div>
                            {motion.kind && (
                                <div>
                                    <strong>Motion Type</strong>
                                    <div>{motion.kind}</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {selectedTab === 'discussion' && motion.requiresDiscussion && (
                    <div className="discussion-wrapper">
                        <div className="discussion-overview card">
                            <div className="overview-header">
                                <span className="overview-icon" />
                                <h4>Discussion Overview</h4>
                            </div>
                            <p className="overview-sub">
                                Member comments and positions on this motion
                            </p>
                            <div className="discussion-stats">
                                <div className="discussion-stat supporting">
                                    <div className="stat-count">
                                        {supportingOpposingCounts.supporting}
                                    </div>
                                    <div className="stat-label">Supporting</div>
                                </div>
                                <div className="discussion-stat opposing">
                                    <div className="stat-count">
                                        {supportingOpposingCounts.opposing}
                                    </div>
                                    <div className="stat-label">Opposing</div>
                                </div>
                                <div className="discussion-stat neutral">
                                    <div className="stat-count">
                                        {supportingOpposingCounts.neutral}
                                    </div>
                                    <div className="stat-label">Neutral</div>
                                </div>
                            </div>
                        </div>

                        <div className="discussion-add card">
                            <h4>Add to Discussion</h4>
                            <p className="sub">
                                Share your thoughts and position on this motion
                            </p>
                            <textarea
                                className="discussion-text"
                                placeholder="Share your thoughts on this motion..."
                                value={replyInputs[motion.id] || ''}
                                onChange={e => handleInputChange(motion.id, e.target.value)}
                                rows={4}
                                disabled={isFinalStatus}
                            />
                            <div className="discussion-controls">
                                <div className="position-select">
                                    <label className="small-label">Your Position</label>
                                    <select
                                        value={replyStances[motion.id] || 'neutral'}
                                        onChange={e =>
                                            handleStanceChange(motion.id, e.target.value)
                                        }
                                        className="reply-select"
                                        disabled={isFinalStatus}
                                    >
                                        <option value="pro">Supporting</option>
                                        <option value="con">Opposing</option>
                                        <option value="neutral">Neutral</option>
                                    </select>
                                </div>
                                <div className="post-action">
                                    <button
                                        onClick={() => addReply(motion.id)}
                                        className="post-comment-btn"
                                        disabled={isFinalStatus}
                                    >
                                        Post Comment
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="discussion-comments card">
                            <h4>
                                Comments {(motion.replies || []).length}
                            </h4>
                            <p className="sub">
                                Member discussions on this motion
                            </p>
                            <div className="comments-list">
                                {!motion.replies || motion.replies.length === 0 ? (
                                    <div className="no-comments">
                                        <div className="no-icon" />
                                        <div className="no-title">No Comments Yet</div>
                                        <div className="no-sub">
                                            Be the first to share your thoughts on this motion
                                        </div>
                                    </div>
                                ) : (
                                    motion.replies.map((reply, idx) => {
                                        const when = reply.createdAt || reply.created || null;
                                        const whenLabel = (() => {
                                            if (!when) return '';
                                            try {
                                                if (when.toDate && typeof when.toDate === 'function') {
                                                    return when.toDate().toLocaleString();
                                                }
                                                const d = new Date(when);
                                                if (!Number.isNaN(d.getTime()))
                                                    return d.toLocaleString();
                                                return String(when);
                                            } catch {
                                                return String(when);
                                            }
                                        })();

                                        const displayName =
                                            reply.authorDisplayName ||
                                            reply.user ||
                                            reply.authorEmail ||
                                            reply.authorUid ||
                                            'Member';
                                        const initials = displayName
                                            .split(' ')
                                            .map(n => n[0])
                                            .slice(0, 2)
                                            .join('')
                                            .toUpperCase();

                                        const stanceRaw = (
                                            reply.stance || reply.position || 'neutral'
                                        )
                                            .toString()
                                            .toLowerCase();
                                        let stanceClass = 'neutral';
                                        let stanceLabel = 'Neutral';
                                        if (
                                            ['pro', 'support', 'supporting'].includes(stanceRaw)
                                        ) {
                                            stanceClass = 'supporting';
                                            stanceLabel = 'Pro';
                                        } else if (
                                            ['con', 'oppose', 'opposing', 'against'].includes(
                                                stanceRaw
                                            )
                                        ) {
                                            stanceClass = 'opposing';
                                            stanceLabel = 'Con';
                                        }

                                        return (
                                            <div className="comment-item" key={idx}>
                                                <div className="comment-left">
                                                    <div className="avatar small">{initials}</div>
                                                </div>
                                                <div className="comment-main">
                                                    <div className="comment-meta">
                                                        <div className="comment-author-block">
                                                            <div className="comment-author">
                                                                <strong>{displayName}</strong>
                                                            </div>
                                                            <div className={`comment-position badge ${stanceClass}`}>
                                                                {stanceLabel}
                                                            </div>
                                                        </div>
                                                        <div className="comment-date">{whenLabel}</div>
                                                    </div>
                                                    <div className="comment-body">
                                                        {reply.text || reply.message}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {selectedTab === 'voting' && (
                    <div className="voting-section">
                        <div className="voting-status card">
                            <div className="status-header">
                                <div>
                                    <h4>Voting Status</h4>
                                    <p className="sub">
                                        {motion.threshold || 'Simple majority required to pass'}
                                    </p>
                                </div>
                                {isOwnerOrChair && (
                                    <button
                                        className="action-btn"
                                        onClick={async () => {
                                            if (disabledFlag) return;
                                            if (passing) await handleApproveMotion(motion.id);
                                            else requestDenyMotion(motion.id);
                                        }}
                                        aria-pressed={passing}
                                        aria-disabled={disabledFlag}
                                        disabled={disabledFlag}
                                    >
                                        {passing ? 'Approve Motion' : 'Deny Motion'}
                                    </button>
                                )}
                            </div>

                            <div className="status-stats">
                                <div className="stat-block">
                                    <div className="stat-number">{yes}</div>
                                    <div className="stat-label">Yes</div>
                                </div>
                                <div className="stat-block">
                                    <div className="stat-number">{no}</div>
                                    <div className="stat-label">No</div>
                                </div>
                                <div className="stat-block">
                                    <div className="stat-number">{abstain}</div>
                                    <div className="stat-label">Abstain</div>
                                </div>
                            </div>

                            <div className="status-progress">
                                <div className="progress-meta">
                                    <div className="progress-label">
                                        Progress: {yes} of required {required}
                                    </div>
                                    <div className="progress-pct">
                                        {total === 0
                                            ? '0%'
                                            : `${Math.round((yes / total) * 100)}%`}
                                    </div>
                                </div>
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{
                                            width:
                                                total === 0
                                                    ? '0%'
                                                    : `${Math.round((yes / total) * 100)}%`,
                                        }}
                                    />
                                </div>
                                <div className="progress-footer">
                                    <div className="total-votes">{total} total votes</div>
                                    <div className="passing-pill">
                                        {passing ? 'Passing' : 'Not Passing'}
                                    </div>
                                </div>
                            </div>

                            {isOwnerOrChair && isFinalStatus && (
                                <div className="owner-actions">
                                    <button
                                        className="record-decision-btn"
                                        onClick={() => setShowRecordDecision(true)}
                                    >
                                        Record Decision Summary
                                    </button>
                                    <button
                                        className="record-decision-btn"
                                        onClick={() => handleProposeOverturn(motion)}
                                    >
                                        Propose Overturn
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="cast-vote card">
                            <h4>Cast Your Vote</h4>
                            <p className="sub">
                                Choose your position on this motion
                            </p>

                            {/* Anonymous voting is determined by the motion's `anonymousVotes` setting; no per-voter toggle */}

                            {isFinalStatus ? (
                                <div className="voting-closed">
                                    <div className="closed-title">Voting closed</div>
                                    <div className="closed-sub">
                                        This motion has been {statusInfo.label.toLowerCase()} and
                                        is no longer accepting votes.
                                    </div>
                                </div>
                            ) : (
                                <div className="vote-options">
                                    <div
                                        className="vote-option yes-option"
                                        onClick={() => !isFinalStatus && vote(null, motion.id, 'yes', motion.anonymousVotes)}
                                        role="button"
                                        tabIndex={0}
                                        aria-disabled={isFinalStatus}
                                    >
                                        <div className="vote-icon" />
                                        <div className="vote-label">{VOTE_LABELS.yes}</div>
                                    </div>
                                    <div
                                        className="vote-option no-option"
                                        onClick={() => !isFinalStatus && vote(null, motion.id, 'no', motion.anonymousVotes)}
                                        role="button"
                                        tabIndex={0}
                                        aria-disabled={isFinalStatus}
                                    >
                                        <div className="vote-icon" />
                                        <div className="vote-label">{VOTE_LABELS.no}</div>
                                    </div>
                                    <div
                                        className="vote-option abstain-option"
                                        onClick={() =>
                                            !isFinalStatus && vote(null, motion.id, 'abstain', motion.anonymousVotes)
                                        }
                                        role="button"
                                        tabIndex={0}
                                        aria-disabled={isFinalStatus}
                                    >
                                        <div className="vote-icon" />
                                        <div className="vote-label">{VOTE_LABELS.abstain}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="vote-record card">
                            <h4>Vote Record</h4>
                            <p className="sub">Public voting record for this motion</p>
                            <div className="vote-list">
                                {(motion.votes || []).map((v, i) => {
                                    const when = v.createdAt || v.created || v.updatedAt || null;
                                    const whenLabel = (() => {
                                        if (!when) return '';
                                        try {
                                            if (when.toDate && typeof when.toDate === 'function') {
                                                return when.toDate().toLocaleString();
                                            }
                                            const d = new Date(when);
                                            if (!Number.isNaN(d.getTime())) return d.toLocaleString();
                                            return String(when);
                                        } catch {
                                            return String(when);
                                        }
                                    })();

                                    const display =
                                        v.voterDisplayName ||
                                        (v.anonymous ? 'Anonymous' : v.voterUid || 'Member');
                                    const initials = (display || 'M')
                                        .toString()
                                        .split(' ')
                                        .map(s => s[0])
                                        .slice(0, 2)
                                        .join('')
                                        .toUpperCase();
                                    const choice = v.choice || 'abstain';

                                    return (
                                        <div className="vote-list-item" key={i}>
                                            <div className="vote-list-left">
                                                <div className="avatar small">{initials}</div>
                                            </div>
                                            <div className="vote-list-main">
                                                <div className="vote-list-name">{display}</div>
                                                <div className="vote-list-date">{whenLabel}</div>
                                            </div>
                                            <div className={`vote-list-badge ${choice}`}>
                                                {choice === 'yes'
                                                    ? 'Yes'
                                                    : choice === 'no'
                                                        ? 'No'
                                                        : 'Abstain'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {showRecordDecision && (
                    <div
                        className="modal-overlay"
                        onClick={e => {
                            if (
                                typeof e.target.className === 'string' &&
                                e.target.className.includes('modal-overlay')
                            ) {
                                setShowRecordDecision(false);
                            }
                        }}
                    >
                        <div className="modal-content">
                            <button
                                className="modal-close"
                                onClick={() => setShowRecordDecision(false)}
                            >
                                ×
                            </button>
                            <h2>Record Decision</h2>
                            <div className="decision-form">
                                <div className="form-row">
                                    <label>Summary</label>
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
                                    <label>Pros (one per line)</label>
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
                                    <label>Cons (one per line)</label>
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
                                    <label>Recording URL (optional)</label>
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
                                        className="modal-create"
                                        onClick={() => handleRecordDecision(motion)}
                                        disabled={recordingDecision}
                                    >
                                        {recordingDecision ? 'Recording...' : 'Record Decision'}
                                    </button>
                                    <button
                                        className="modal-cancel"
                                        onClick={() => setShowRecordDecision(false)}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {showDenyConfirm && (
                    <div
                        className="confirm-overlay"
                        onClick={e => {
                            if (
                                typeof e.target.className === 'string' &&
                                e.target.className.includes('confirm-overlay')
                            ) {
                                setShowDenyConfirm(false);
                                setDenyTargetMotionId(null);
                            }
                        }}
                    >
                        <div className="confirm-content">
                            <h3>Deny motion?</h3>
                            <p>
                                Are you sure you want to deny this motion? Denying will mark
                                the motion as rejected and it will not be discussed further.
                            </p>
                            <div className="confirm-actions">
                                <button
                                    className="confirm-cancel"
                                    onClick={() => {
                                        setShowDenyConfirm(false);
                                        setDenyTargetMotionId(null);
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="confirm-delete"
                                    onClick={async () => {
                                        if (!denyTargetMotionId) return;
                                        try {
                                            await handleDenyMotion(denyTargetMotionId);
                                        } catch (e) {
                                            console.error('Deny failed', e);
                                        }
                                    }}
                                >
                                    Confirm Deny
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Default list view for all motions (if not in detail mode)
    return (
        <div className="motions-page">
            <button
                className="back-button"
                onClick={() => navigate(-1)}
                aria-label="Go back"
            >
                <span className="back-arrow" />
                <span className="back-label">Back</span>
            </button>
            <h1>Motions</h1>

            <div id="motions-container">
                {motions.map(motion => {
                    const si = getStatusInfo(motion);
                    const isFinal = si.key === 'approved' || si.key === 'denied';
                    const createdAtLabel = formatDateField(motion.createdAt);
                    return (
                        <div
                            id={'motion-' + motion.id}
                            key={motion.id}
                            className={`motion motion-${motion.status.toLowerCase()}`}
                        >
                            <div className="status-badge-top">{si.label}</div>
                            <div
                                style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                            >
                                <h2 style={{ margin: 0 }}>{motion.title}</h2>
                                <span className="status-tag">{si.label}</span>
                            </div>
                            <p>
                                <strong>Description</strong> {motion.description}
                            </p>
                            <p>
                                <strong>Creator</strong> {motion.creator}
                                <span
                                    style={{
                                        marginLeft: 12,
                                        color: 'var(--text)',
                                        opacity: 0.85,
                                    }}
                                >
                  {createdAtLabel}
                </span>
                            </p>
                            <div className="motion-meta-row">
                                <div className="motion-meta">
                                    <span className="creator">{motion.creator}</span>
                                </div>
                                <div className="motion-meta-right">
                                    <span className="date">{createdAtLabel}</span>
                                </div>
                            </div>
                            <p>
                                <strong>Status</strong> {motion.status}
                            </p>
                            <p>
                                <strong>Vote Threshold</strong> {motion.threshold}
                            </p>
                            <div className="motion-actions">
                                <button
                                    className="view-details-btn"
                                    onClick={() => {
                                        navigate(`/motions?id=${motion.id}`);
                                    }}
                                >
                                    View Details
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}