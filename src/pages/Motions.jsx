// javascript
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/Motions.css';
import { replyToMotion, castVote, approveMotion, closeMotionVoting, denyMotion } from '../firebase/committees';
import { db, auth } from '../firebase/firebase';
import { collection, onSnapshot, doc, getDocs, getDoc } from 'firebase/firestore';

export default function Motions() {
    const location = useLocation();
    const navigate = useNavigate();
    const [motions, setMotions] = useState([]);
    const [actionMessage, setActionMessage] = useState(null); // { text, variant }
    const [replyInputs, setReplyInputs] = useState({});
    const [replyStances, setReplyStances] = useState({});
    const [committeeOwnerUid, setCommitteeOwnerUid] = useState(null); // New state for committee owner UID
    const [ownerActionDisabled, setOwnerActionDisabled] = useState({}); // map of motionId -> bool to prevent double actions
    const [selectedTab, setSelectedTab] = useState('overview');

    // Centralized labels for vote buttons so they can be changed in one place
    const VOTE_LABELS = {
        yes: 'Yes',
        no: 'No',
        abstain: 'Abstain'
    };

    // derive motion id and committee id (sessionStorage established by Committee view)
    useEffect(() => {
        let cid = null;
        const params = new URLSearchParams(location.search);
        const motionId = params.get('id'); // Get motionId directly from URL here

        try {
            const raw = sessionStorage.getItem('motion_' + motionId);
            if (raw) {
                const parsed = JSON.parse(raw);
                cid = parsed.committeeId || null;
            }
        } catch (e) { cid = null; }

        if (!cid) {
            // No committee context available — server-only app: show no motions
            setMotions([]);
            return;
        }

        // Fetch committee owner UID
        (async () => {
            try {
                const committeeDoc = await getDoc(doc(db, 'committees', cid));
                if (committeeDoc.exists()) {
                    setCommitteeOwnerUid(committeeDoc.data().ownerUid);
                }
            } catch (e) {
                console.error('Failed to fetch committee owner:', e);
            }
        })();

        // subscribe to motions in Firestore for this committee
        const motionsCol = collection(db, 'committees', cid, 'motions');
        const unsub = onSnapshot(motionsCol, (snap) => {
            // create raw motions with creatorUid where available
            const raw = snap.docs.map(d => {
                const md = d.data();
                return {
                    id: d.id,
                    title: md.title || md.name || 'Untitled Motion',
                    description: md.description || '',
                    // keep both creator (possibly name) and creatorUid for enrichment
                    creator: md.creator || '',
                    creatorDisplayName: md.creatorDisplayName || '',
                    creatorUid: md.creatorUid || null,
                    status: md.status || 'active',
                    replies: md.replies || [],
                    tally: md.tally || { yes: 0, no: 0, abstain: 0 },
                    threshold: md.threshold || 'Simple Majority', // Use threshold
                    createdAt: md.createdAt || md.created || md.created_at || null
                };
            });

            // asynchronously enrich motions with related subcollections (replies, votes)
            (async () => {
                try {
                    // We'll build the complete UID set (creators, reply authors, voters)
                    // after fetching replies/votes so we only fetch profiles once.

                    // Fetch replies and votes subcollections for each motion so persisted comments and vote records show up
                    const repliesByMotion = {};
                    const votesByMotion = {};
                    await Promise.all(raw.map(async (m) => {
                        try {
                            const repliesSnap = await getDocs(collection(db, 'committees', cid, 'motions', m.id, 'replies'));
                            repliesByMotion[m.id] = repliesSnap.docs.map(r => ({ id: r.id, ...(r.data() || {}) }));
                        } catch (e) {
                            repliesByMotion[m.id] = m.replies || [];
                        }
                        try {
                            const votesSnap = await getDocs(collection(db, 'committees', cid, 'motions', m.id, 'votes'));
                            votesByMotion[m.id] = votesSnap.docs.map(v => ({ id: v.id, ...(v.data() || {}) }));
                        } catch (e) {
                            votesByMotion[m.id] = [];
                        }
                    }));

                    // Build set of user UIDs to fetch profiles for (creators, reply authors, voters)
                    const uidSet = new Set(raw.map(m => m.creatorUid).filter(Boolean));
                    Object.values(repliesByMotion).forEach(list => list.forEach(r => r.authorUid && uidSet.add(r.authorUid)));
                    Object.values(votesByMotion).forEach(list => list.forEach(v => v.voterUid && uidSet.add(v.voterUid)));
                    const uids = Array.from(uidSet);

                    // Fetch profiles for all relevant UIDs
                    const profiles = {};
                    await Promise.all(uids.map(async (uid) => {
                        try {
                            const userDoc = await getDoc(doc(db, 'users', uid));
                            if (userDoc.exists()) profiles[uid] = userDoc.data();
                        } catch (e) {
                            // ignore individual profile errors
                        }
                    }));

                    let docs = raw.map(m => {
                        // Prefer an explicit creatorDisplayName written at creation,
                        // then try to resolve via creatorUid -> users profile,
                        // finally fall back to any stored `creator` value (which
                        // in older data may contain a uid).
                        const displayName = m.creatorDisplayName || (m.creatorUid && profiles[m.creatorUid]?.displayName) || m.creator || '';
                        return {
                            id: m.id,
                            title: m.title,
                            description: m.description,
                            creator: displayName || (m.creatorUid || ''),
                            status: m.status,
                            replies: repliesByMotion[m.id] || m.replies || [],
                            votes: votesByMotion[m.id] || [],
                            tally: m.tally,
                            threshold: m.threshold, // Ensure threshold is passed through
                            createdAt: m.createdAt || null
                        };
                    }).sort((a, b) => (b.id || '').localeCompare(a.id || ''));

                    if (motionId) { // Filter if motionId is present
                        docs = docs.filter(m => m.id === motionId);
                    }
                    setMotions(docs);
                } catch (e) {
                    // fallback to raw list if enrichment fails
                    let docs = raw.map(m => ({ id: m.id, title: m.title, description: m.description, creator: m.creator || (m.creatorUid || ''), status: m.status, replies: m.replies, tally: m.tally, threshold: m.threshold })).sort((a, b) => (b.id || '').localeCompare(a.id || '')); // Ensure threshold is passed through
                    if (motionId) { // Filter if motionId is present
                        docs = docs.filter(m => m.id === motionId);
                    }
                    setMotions(docs);
                }
            })();
        }, (err) => {
            console.warn('motions listener failed', err);
        });

        return () => unsub();
    }, [location.search]);

    const isCommitteeOwner = auth.currentUser?.uid === committeeOwnerUid;

    // Evaluate whether a motion meets its voting threshold
    function evaluateThreshold(m) {
        const yes = (m.tally?.yes) || 0;
        const no = (m.tally?.no) || 0;
        const abstain = (m.tally?.abstain) || 0;
        const total = yes + no + abstain;
        const thrRaw = (m.threshold || m.voteThreshold || 'Simple Majority').toString().toLowerCase();
        let required = 0;
        let passing = false;
        if (total === 0) {
            // No votes yet — cannot pass
            required = 1;
            passing = false;
        } else if (thrRaw.includes('two')) {
            required = Math.ceil((2 / 3) * total);
            passing = yes >= required;
        } else if (thrRaw.includes('unanim')) {
            required = total;
            passing = (yes === total && total > 0);
        } else {
            // default: simple majority >50% of votes cast
            required = Math.floor(total / 2) + 1;
            passing = yes >= required;
        }
        return { yes, no, abstain, total, required, passing };
    }

    // Resolve a committeeId for a motion: prefer URL param 'cid', then sessionStorage 'motion_<id>' entry
    function resolveCommitteeId(motionId) {
        try {
            const params = new URLSearchParams(location.search);
            const cidFromUrl = params.get('cid');
            if (cidFromUrl) return cidFromUrl;
        } catch (e) { }
        try {
            const raw = sessionStorage.getItem('motion_' + motionId);
            if (raw) {
                const parsed = JSON.parse(raw);
                return parsed.committeeId || parsed.cid || null;
            }
        } catch (e) { }
        return null;
    }

    // Normalize motion status to one of: active, approved, denied
    function getStatusInfo(m) {
        const raw = (m.status || '').toString().toLowerCase();
        if (raw.includes('den')) return { key: 'denied', label: 'Denied' };
        if (raw.includes('app') || raw === 'approved' || m.approvedAt) return { key: 'approved', label: 'Approved' };
        if (raw.includes('close') || raw.includes('completed') || raw.includes('closed')) {
            // If closed/completed, infer from votes if possible
            try {
                const ev = evaluateThreshold(m);
                return ev.passing ? { key: 'approved', label: 'Approved' } : { key: 'denied', label: 'Denied' };
            } catch (e) {
                return { key: 'denied', label: 'Denied' };
            }
        }
        return { key: 'active', label: 'Active' };
    }

    async function handleApproveMotion(motionId) {
        if (!window.confirm('Are you sure you want to approve this motion?')) return;
        try {
            // optimistically disable the owner action for this motion to avoid duplicates
            setOwnerActionDisabled(prev => ({ ...(prev || {}), [motionId]: true }));
            const cid = resolveCommitteeId(motionId);
            if (cid) {
                await approveMotion(cid, motionId);
                // show success prompt
                setActionMessage({ text: 'Motion approved', variant: 'success' });
                setTimeout(() => setActionMessage(null), 3500);
            } else {
                console.error('Committee ID not found for approving motion.');
                alert('Committee ID not found for approving motion.');
            }
        } catch (err) {
            console.error('Failed to approve motion:', err);
            alert('Failed to approve motion: ' + err.message);
            setActionMessage({ text: 'Failed to approve motion', variant: 'error' });
            setTimeout(() => setActionMessage(null), 3500);
            // allow retry on error
            setOwnerActionDisabled(prev => ({ ...(prev || {}), [motionId]: false }));
        }
    }

    async function handleDenyMotion(motionId) {
        if (!window.confirm('Are you sure you want to deny this motion?')) return;
        try {
            // prevent double-deny clicks while request is in flight
            setOwnerActionDisabled(prev => ({ ...(prev || {}), [motionId]: true }));
            const cid = resolveCommitteeId(motionId);
            if (cid) {
                await denyMotion(cid, motionId);
                setActionMessage({ text: 'Motion denied', variant: 'error' });
                setTimeout(() => setActionMessage(null), 3500);
            } else {
                console.error('Committee ID not found for denying motion.');
                alert('Committee ID not found for denying motion.');
            }
        } catch (err) {
            console.error('Failed to deny motion:', err);
            alert('Failed to deny motion: ' + err.message);
            setActionMessage({ text: 'Failed to deny motion', variant: 'error' });
            setTimeout(() => setActionMessage(null), 3500);
            // allow retry on error
            setOwnerActionDisabled(prev => ({ ...(prev || {}), [motionId]: false }));
        }
    }

    async function handleCloseMotionVoting(motionId) {
        if (!window.confirm('Are you sure you want to close voting for this motion?')) return;
        try {
            const params = new URLSearchParams(location.search);
            const cid = params.get('cid'); // Use cid from URL if available, or from state if set
            if (cid) {
                await closeMotionVoting(cid, motionId);
            } else {
                console.error('Committee ID not found for closing motion voting.');
                alert('Committee ID not found for closing motion voting.');
            }
        } catch (err) {
            console.error('Failed to close voting for motion:', err);
            alert('Failed to close voting for motion: ' + err.message);
        }
    }

    function handleInputChange(id, value) {
        setReplyInputs((prev) => ({ ...prev, [id]: value }));
    }
    function handleStanceChange(id, value) {
        setReplyStances((prev) => ({ ...prev, [id]: value }));
    }

    async function addReply(motionId) {
        const text = (replyInputs[motionId] || '').trim();
        if (!text) return;
        const stance = replyStances[motionId] || 'pro';

        // Attempt to persist to backend if we can infer committeeId from sessionStorage
        let committeeId = null;
        try {
            const raw = sessionStorage.getItem('motion_' + motionId);
            if (raw) {
                const parsed = JSON.parse(raw);
                committeeId = parsed.committeeId || null;
            }
        } catch (e) { committeeId = null; }

        if (committeeId) {
            try {
                await replyToMotion(committeeId, motionId.toString(), { text, stance });
            } catch (err) {
                console.warn('replyToMotion failed:', err);
            }
        }

        // Prefer the authenticated user's displayName/email/uid for local reply rendering
        const currentUserName = auth?.currentUser?.displayName || auth?.currentUser?.email || auth?.currentUser?.uid || 'You';
        const currentUserUid = auth?.currentUser?.uid || null;
        const localReply = { user: currentUserName, authorUid: currentUserUid, text, stance, createdAt: new Date() };
        setMotions((prev) => prev.map((m) => (m.id === motionId ? { ...m, replies: [...(m.replies || []), localReply] } : m)));
        setReplyInputs((prev) => ({ ...prev, [motionId]: '' }));
        setReplyStances((prev) => ({ ...prev, [motionId]: 'pro' }));
    }

    async function vote(committeeId, motionId, choice) {
        // If a committeeId is passed use it; else try to read from sessionStorage
        let cid = committeeId;
        if (!cid) {
            try {
                const raw = sessionStorage.getItem('motion_' + motionId);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    cid = parsed.committeeId || null;
                }
            } catch (e) { cid = null; }
        }

        if (cid) {
            try {
                await castVote(cid, motionId.toString(), { choice, anonymous: false });
                // castVote updates Firestore tally via transaction; onSnapshot will refresh UI
                return;
            } catch (err) {
                console.error('castVote failed:', err);
            }
        }

        // Local fallback: ensure user can only have one vote per motion locally
        setMotions((prev) => prev.map((m) => {
            if (m.id !== motionId) return m;
            const tally = { ...(m.tally || { yes: 0, no: 0, abstain: 0 }) };
            // simple local: increment chosen (no decrement of previous) - for robust local-only behavior you'd track local votes per user
            if (choice === 'yes') tally.yes = (tally.yes || 0) + 1;
            else if (choice === 'no') tally.no = (tally.no || 0) + 1;
            else tally.abstain = (tally.abstain || 0) + 1;
            return { ...m, tally };
        }));
    }

    useEffect(() => {
        try {
            const params = new URLSearchParams(location.search);
            const id = params.get('id');
            if (id) {
                const el = document.getElementById(`motion-${id}`);
                if (el && el.scrollIntoView) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('focused-motion');
                    setTimeout(() => el.classList.remove('focused-motion'), 2200);
                }
            }
        } catch (e) { }
    }, [location.search]);

    // helper to format createdAt fields from Firestore Timestamps or ISO strings
    function formatDateField(value) {
        if (!value) return '';
        try {
            if (value.toDate && typeof value.toDate === 'function') {
                return value.toDate().toLocaleDateString();
            }
            const d = new Date(value);
            if (!isNaN(d.getTime())) return d.toLocaleDateString();
        } catch (e) { }
        return String(value);
    }

    // If the URL requested a specific motion and we have a single motion, render the detail view
    const params = new URLSearchParams(location.search);
    const motionIdParam = params.get('id');
    const isDetailView = motionIdParam && motions.length === 1;

    if (isDetailView) {
        const motion = motions[0];
        const statusInfo = getStatusInfo(motion);
        const isFinalStatus = statusInfo.key === 'approved' || statusInfo.key === 'denied';

        function formatDateField(value) {
            if (!value) return '';
            try {
                // Firestore Timestamp object
                if (value.toDate && typeof value.toDate === 'function') {
                    const d = value.toDate();
                    return d.toLocaleDateString();
                }
                const d = new Date(value);
                if (!isNaN(d.getTime())) return d.toLocaleDateString();
            } catch (e) { }
            return String(value);
        }

        const authorName = motion.creator || motion.author || motion.createdBy || 'Unknown';
        const createdAt = formatDateField(motion.createdAt || motion.created || motion.created_at);

        const voteThreshold = motion.threshold || motion.voteThreshold || 'Simple Majority';
        return (
            <div className="motions-page motion-detail">
                <button className="back-button" onClick={() => navigate(-1)} aria-label="Back to Motions">
                    <span className="back-arrow">←</span>
                    <span className="back-label">Back</span>
                </button>

                <div className="detail-top">
                    <div className="detail-title">
                        <h1>{motion.title}</h1>
                        <p className="subtitle">{motion.description || 'Motion details and timeline'}</p>
                    </div>
                    <div className="detail-actions">
                        <span className="role-badge">Member</span>
                    </div>
                </div>
                {actionMessage && (
                    <div className={`action-toast ${actionMessage.variant || ''}`} role="status">
                        <span className="action-toast-text">{actionMessage.text}</span>
                        <button className="action-toast-close" onClick={() => setActionMessage(null)}>×</button>
                    </div>
                )}

                <div className="tabs" role="tablist">
                    <button aria-selected={selectedTab === 'overview'} onClick={() => setSelectedTab('overview')} className={`tab ${selectedTab === 'overview' ? 'active' : ''}`}>Overview</button>
                    <button aria-selected={selectedTab === 'discussion'} onClick={() => setSelectedTab('discussion')} className={`tab ${selectedTab === 'discussion' ? 'active' : ''}`}>Discussion</button>
                    <button aria-selected={selectedTab === 'voting'} onClick={() => setSelectedTab('voting')} className={`tab ${selectedTab === 'voting' ? 'active' : ''}`}>Voting</button>
                </div>

                <div className="cards-row">
                    <div className="card small-card">
                        <div className="card-label">Author</div>
                        <div className="card-body">
                            <div className="avatar">{(authorName || '').split(' ').map(n => n[0]).slice(0, 2).join('')}</div>
                            <div className="card-name">{authorName}</div>
                            <div className="card-sub">{(motion.creatorEmail || motion.email || (authorName?.toLowerCase?.().includes('@') ? authorName : ''))}</div>
                        </div>
                    </div>


                    <div className="card timeline-card">
                        <div className="card-label">Timeline</div>
                        <div className="card-body timeline-body">
                            <div><strong>Created:</strong> {createdAt || '—'}</div>
                        </div>
                    </div>
                </div>
                {/* Panels: show only the selected tab content to match design */}
                {selectedTab === 'overview' && (
                    <>
                        <div className="motion-details-box">
                            <h3>Motion Details</h3>
                            <div className="details-grid">
                                <div><strong>Vote Threshold:</strong> {voteThreshold}</div>
                                <div><strong>Status:</strong> {motion.status}</div>
                            </div>
                        </div>
                    </>
                )}

                {selectedTab === 'discussion' && (
                    <div className="discussion-wrapper">
                        <div className="discussion-overview card">
                            <div className="overview-header">
                                <span className="overview-icon">💬</span>
                                <h4>Discussion Overview</h4>
                            </div>
                            <p className="overview-sub">Member comments and positions on this motion</p>
                            <div className="discussion-stats">
                                {(() => {
                                    const counts = { supporting: 0, opposing: 0, neutral: 0 };
                                    (motion.replies || []).forEach(r => {
                                        const s = (r.stance || r.position || '').toString().toLowerCase();
                                        if (['pro', 'support', 'supporting'].includes(s)) counts.supporting++;
                                        else if (['con', 'opp', 'opposing', 'against'].includes(s)) counts.opposing++;
                                        else counts.neutral++;
                                    });
                                    return (
                                        <>
                                            <div className="discussion-stat supporting">
                                                <div className="stat-count">{counts.supporting}</div>
                                                <div className="stat-label">Supporting</div>
                                            </div>
                                            <div className="discussion-stat opposing">
                                                <div className="stat-count">{counts.opposing}</div>
                                                <div className="stat-label">Opposing</div>
                                            </div>
                                            <div className="discussion-stat neutral">
                                                <div className="stat-count">{counts.neutral}</div>
                                                <div className="stat-label">Neutral</div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="discussion-add card">
                            <h4>Add to Discussion</h4>
                            <p className="sub">Share your thoughts and position on this motion</p>
                            <textarea
                                className="discussion-text"
                                placeholder="Share your thoughts on this motion..."
                                value={replyInputs[motion.id] || ''}
                                onChange={(e) => handleInputChange(motion.id, e.target.value)}
                                rows={4}
                                disabled={isFinalStatus || motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}
                            />

                            <div className="discussion-controls">
                                <div className="position-select">
                                    <label className="small-label">Your Position</label>
                                    <select value={replyStances[motion.id] || 'neutral'} onChange={(e) => handleStanceChange(motion.id, e.target.value)} className="reply-select" disabled={isFinalStatus || motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>
                                        <option value="pro">Supporting</option>
                                        <option value="con">Opposing</option>
                                        <option value="neutral">Neutral</option>
                                    </select>
                                </div>

                                <div className="post-action">
                                    <button onClick={() => addReply(motion.id)} className="post-comment-btn" disabled={isFinalStatus || motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>Post Comment</button>
                                </div>
                            </div>
                        </div>

                        <div className="discussion-comments card">
                            <h4>Comments ({(motion.replies || []).length})</h4>
                            <p className="sub">Member discussions on this motion</p>
                            <div className="comments-list">
                                {(!motion.replies || motion.replies.length === 0) ? (
                                    <div className="no-comments">
                                        <div className="no-icon">🗨️</div>
                                        <div className="no-title">No Comments Yet</div>
                                        <div className="no-sub">Be the first to share your thoughts on this motion</div>
                                    </div>
                                ) : (
                                    motion.replies.map((reply, idx) => {
                                        const when = reply.createdAt || reply.created || reply.timestamp || null;
                                        const whenLabel = (function formatDateTime(value) {
                                            if (!value) return '';
                                            try {
                                                if (value.toDate && typeof value.toDate === 'function') {
                                                    return value.toDate().toLocaleString();
                                                }
                                                const d = new Date(value);
                                                if (!isNaN(d.getTime())) return d.toLocaleString();
                                            } catch (e) { }
                                            return String(value);
                                        })(when);

                                        const displayName = reply.authorDisplayName || reply.user || reply.authorEmail || reply.authorUid || 'Member';
                                        const initials = (displayName || 'M').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
                                        const stanceRaw = (reply.stance || reply.position || '').toString().toLowerCase();
                                        let stanceClass = 'neutral';
                                        let stanceLabel = 'Neutral';
                                        if (['pro', 'support', 'supporting'].includes(stanceRaw)) { stanceClass = 'supporting'; stanceLabel = 'Pro'; }
                                        else if (['con', 'opp', 'opposing', 'against'].includes(stanceRaw)) { stanceClass = 'opposing'; stanceLabel = 'Con'; }

                                        return (
                                            <div className="comment-item" key={idx}>
                                                <div className="comment-left">
                                                    <div className="avatar small">{initials}</div>
                                                </div>
                                                <div className="comment-main">
                                                    <div className="comment-meta">
                                                        <div className="comment-author-block">
                                                            <div className="comment-author"><strong>{displayName}</strong></div>
                                                            <div className={`comment-position badge ${stanceClass}`}>{stanceLabel}</div>
                                                        </div>
                                                        <div className="comment-date">{whenLabel}</div>
                                                    </div>
                                                    <div className="comment-body">{reply.text || reply.message || ''}</div>
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
                                    <p className="sub">{motion.threshold || 'Simple majority required to pass'}</p>
                                </div>
                            </div>

                            {/* Owner action button shown only inside the Voting card (top-right) */}
                            {isCommitteeOwner && (() => {
                                const ev = evaluateThreshold(motion);
                                const disabledFlag = isFinalStatus || Boolean(ownerActionDisabled && ownerActionDisabled[motion.id]);
                                const handleAction = async () => {
                                    if (disabledFlag) return;
                                    if (ev.passing) {
                                        await handleApproveMotion(motion.id);
                                    } else {
                                        await handleDenyMotion(motion.id);
                                    }
                                };
                                return (
                                    <button
                                        className={`action-btn ${ev.passing ? 'approve' : 'deny'}`}
                                        onClick={handleAction}
                                        aria-pressed={ev.passing}
                                        aria-disabled={disabledFlag}
                                        disabled={disabledFlag}
                                        style={{ position: 'absolute' }}
                                    >
                                        {ev.passing ? 'Approve Motion' : 'Deny Motion'}
                                    </button>
                                );
                            })()}

                            <div className="status-stats">
                                <div className="stat-block">
                                    <div className="stat-number yes">{motion.tally?.yes || 0}</div>
                                    <div className="stat-label">Yes</div>
                                </div>
                                <div className="stat-block">
                                    <div className="stat-number no">{motion.tally?.no || 0}</div>
                                    <div className="stat-label">No</div>
                                </div>
                                <div className="stat-block">
                                    <div className="stat-number abstain">{motion.tally?.abstain || 0}</div>
                                    <div className="stat-label">Abstain</div>
                                </div>
                            </div>

                            <div className="status-progress">
                                {(() => {
                                    const { yes, no, abstain, total, required, passing } = evaluateThreshold(motion);
                                    const pct = total === 0 ? 0 : Math.round((yes / total) * 100);
                                    return (
                                        <>
                                            <div className="progress-meta">
                                                <div className="progress-label">Progress ({yes} of {required} required)</div>
                                                <div className="progress-pct">{pct}%</div>
                                            </div>
                                            <div className="progress-bar">
                                                <div className="progress-fill" style={{ width: `${pct}%` }} />
                                            </div>
                                            <div className="progress-footer">
                                                <div className="total-votes">👥 {total} total votes</div>
                                                <div className={`passing-pill ${passing ? 'passing' : 'failing'}`}>{passing ? 'Passing' : 'Not Passing'}</div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Owner actions moved to a single bottom-left action button for detail view */}
                        </div>

                        <div className="cast-vote card">
                            <h4>Cast Your Vote</h4>
                            <p className="sub">Choose your position on this motion</p>
                            {isFinalStatus ? (
                                <div className="voting-closed">
                                    <div className="closed-title">Voting closed</div>
                                    <div className="closed-sub">This motion has been {statusInfo.label.toLowerCase()} and is no longer accepting votes.</div>
                                </div>
                            ) : (
                                <div className="vote-options">
                                    <div className="vote-option yes-option" onClick={() => !isFinalStatus && vote(null, motion.id, 'yes')} role="button" tabIndex={0} aria-disabled={isFinalStatus || motion.status === 'closed'}>
                                        <div className="vote-ico">✓</div>
                                        <div className="vote-label">Yes</div>
                                    </div>
                                    <div className="vote-option no-option" onClick={() => !isFinalStatus && vote(null, motion.id, 'no')} role="button" tabIndex={0} aria-disabled={isFinalStatus || motion.status === 'closed'}>
                                        <div className="vote-ico">✕</div>
                                        <div className="vote-label">No</div>
                                    </div>
                                    <div className="vote-option abstain-option" onClick={() => !isFinalStatus && vote(null, motion.id, 'abstain')} role="button" tabIndex={0} aria-disabled={isFinalStatus || motion.status === 'closed'}>
                                        <div className="vote-ico">—</div>
                                        <div className="vote-label">Abstain</div>
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
                                    const whenLabel = (function fmt(val) { try { if (val && val.toDate) return val.toDate().toLocaleString(); const d = new Date(val); if (!isNaN(d.getTime())) return d.toLocaleString(); } catch (e) { } return ''; })(when);
                                    const choice = v.choice || 'abstain';
                                    // Prefer stored voterDisplayName when available (written at vote time),
                                    // otherwise fall back to voterUid and current user display
                                    const display = v.voterDisplayName || (v.voterUid && (v.voterUid === auth?.currentUser?.uid ? (auth?.currentUser?.displayName || 'You') : v.voterUid)) || 'Member';
                                    const initials = (display || 'M').toString().split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
                                    return (
                                        <div className="vote-list-item" key={i}>
                                            <div className="vote-list-left">
                                                <div className="avatar small">{initials}</div>
                                            </div>
                                            <div className="vote-list-main">
                                                <div className="vote-list-name">{display}</div>
                                                <div className="vote-list-date">{whenLabel}</div>
                                            </div>
                                            <div className={`vote-list-badge ${choice === 'yes' ? 'yes' : choice === 'no' ? 'no' : 'abstain'}`}>{choice === 'yes' ? 'Yes' : choice === 'no' ? 'No' : 'Abstain'}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

            </div>
        );
    }

    // Default list view when not in a detail route
    return (
        <div className="motions-page">
            <button className="back-button" onClick={() => navigate(-1)} aria-label="Go back">
                <span className="back-arrow">←</span>
                <span className="back-label">Back</span>
            </button>
            <h1>Motions</h1>
            <div id="motions-container">
                {motions.map((motion) => {
                    const si = getStatusInfo(motion);
                    const isFinal = si.key === 'approved' || si.key === 'denied';
                    return (
                        <div
                            id={`motion-${motion.id}`}
                            key={motion.id}
                            className={`motion motion-${(motion.status || '').toLowerCase()}`}
                        >
                            {/* Top-right status badge on the physical card */}
                            <div className={`status-badge-top ${si.key}`}>{si.label}</div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <h2 style={{ margin: 0 }}>{motion.title}</h2>
                                <span className={`status-tag ${si.key}`}>{si.label}</span>
                            </div>

                            <p><strong>Description:</strong> {motion.description}</p>
                            <p>
                                <strong>Creator:</strong> {motion.creator}
                                <span style={{ marginLeft: 12, color: 'var(--text)', opacity: 0.85 }}>{formatDateField(motion.createdAt)}</span>
                            </p>

                            <div className="motion-meta-row">
                                <div className="motion-meta">
                                    <span className="creator">{motion.creator}</span>
                                </div>
                                <div className="motion-meta-right">
                                    <span className="date">{formatDateField(motion.createdAt) || '—'}</span>
                                </div>
                            </div>

                            <p><strong>Status:</strong> {motion.status}</p>
                            <p><strong>Vote Threshold:</strong> {motion.threshold}</p>

                            <div className="motion-actions">
                                {/* Close Voting removed — votes are finalized when motion is approved/denied */}
                            </div>

                            <div className="replies">
                                <h3>Discussion</h3>
                                {(!motion.replies || motion.replies.length === 0) ? (
                                    <div className="no-replies">No replies yet.</div>
                                ) : (
                                    motion.replies.map((reply, idx) => {
                                        const stanceRaw = (reply.stance || reply.position || 'neutral').toString().toLowerCase();
                                        let stanceClass = 'neutral';
                                        let stanceLabel = 'Neutral';
                                        if (['pro', 'support', 'supporting'].includes(stanceRaw)) { stanceClass = 'supporting'; stanceLabel = 'Pro'; }
                                        else if (['con', 'opp', 'opposing', 'against'].includes(stanceRaw)) { stanceClass = 'opposing'; stanceLabel = 'Con'; }
                                        return (
                                            <div className="reply" key={idx}>
                                                <strong>
                                                    {reply.authorDisplayName || reply.user || reply.authorUid}
                                                    <span className={`comment-position badge ${stanceClass}`} style={{ marginLeft: 8, marginRight: 6 }}>{stanceLabel}</span>:
                                                </strong>
                                                <span style={{ marginLeft: 8 }}>{reply.text || reply.message || ''}</span>
                                            </div>
                                        );
                                    })
                                )}

                                <div className="reply-form">
                                    <input
                                        type="text"
                                        placeholder="Add a reply..."
                                        value={replyInputs[motion.id] || ''}
                                        onChange={(e) => handleInputChange(motion.id, e.target.value)}
                                        className="reply-input"
                                        disabled={isFinal || motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}
                                    />
                                    <select value={replyStances[motion.id] || 'pro'} onChange={(e) => handleStanceChange(motion.id, e.target.value)} className="reply-select" disabled={isFinal || motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>
                                        <option value="pro">Pro</option>
                                        <option value="con">Con</option>
                                        <option value="neutral">Neutral</option>
                                    </select>
                                    <button onClick={() => addReply(motion.id)} className="reply-button" disabled={isFinal || motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>Add Reply</button>
                                </div>
                            </div>

                            <div className="voting">
                                <h4>Vote</h4>
                                <div className="vote-grid">
                                    <div className="vote-card yes-card">
                                        <div className="vote-icon">✓</div>
                                        <div className="vote-count">{VOTE_LABELS.yes}: {motion.tally?.yes || 0}</div>
                                        <button className="vote-btn vote-yes" onClick={() => !isFinal && vote(null, motion.id, 'yes')} disabled={isFinal || motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>{`Vote ${VOTE_LABELS.yes}`}</button>
                                    </div>

                                    <div className="vote-card no-card">
                                        <div className="vote-icon">✕</div>
                                        <div className="vote-count">{VOTE_LABELS.no}: {motion.tally?.no || 0}</div>
                                        <button className="vote-btn vote-no" onClick={() => !isFinal && vote(null, motion.id, 'no')} disabled={isFinal || motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>{`Vote ${VOTE_LABELS.no}`}</button>
                                    </div>

                                    <div className="vote-card abstain-card">
                                        <div className="vote-icon">—</div>
                                        <div className="vote-count">{VOTE_LABELS.abstain}: {motion.tally?.abstain || 0}</div>
                                        <button className="vote-btn vote-abstain" onClick={() => !isFinal && vote(null, motion.id, 'abstain')} disabled={isFinal || motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>{VOTE_LABELS.abstain}</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}