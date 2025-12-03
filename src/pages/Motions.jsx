// javascript
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/Motions.css';
import { replyToMotion, castVote, approveMotion, closeMotionVoting } from '../firebase/committees';
import { db, auth } from '../firebase/firebase';
import { collection, onSnapshot, doc, getDocs, getDoc } from 'firebase/firestore';

export default function Motions() {
    const location = useLocation();
    const navigate = useNavigate();
    const [motions, setMotions] = useState([]);
    const [replyInputs, setReplyInputs] = useState({});
    const [replyStances, setReplyStances] = useState({});
    const [committeeOwnerUid, setCommitteeOwnerUid] = useState(null); // New state for committee owner UID
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
            // fallback: try to read all motions from localStorage
            try {
                const raw = localStorage.getItem('homeData');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    // flatten local motions
                    const all = [];
                    for (const k in parsed.committeeData || {}) {
                        const cm = parsed.committeeData[k];
                        (cm.motions || []).forEach(m => all.push({ ...m, threshold: m.threshold || 'Simple Majority' })); // Use threshold
                    }
                    setMotions(all);
                }
            } catch (e) { }
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
                    creatorUid: md.creatorUid || null,
                    status: md.status || 'active',
                    replies: md.replies || [],
                    tally: md.tally || { yes: 0, no: 0, abstain: 0 },
                    threshold: md.threshold || 'Simple Majority', // Use threshold
                    createdAt: md.createdAt || md.created || md.created_at || null
                };
            });

            // asynchronously enrich motions with displayName from users collection when possible
            (async () => {
                try {
                    // build list of unique uids to fetch
                    const uids = Array.from(new Set(raw.map(m => m.creatorUid).filter(Boolean)));
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
                        const displayName = m.creator || (m.creatorUid && profiles[m.creatorUid]?.displayName) || '';
                        return {
                            id: m.id,
                            title: m.title,
                            description: m.description,
                            creator: displayName || (m.creatorUid || ''),
                            status: m.status,
                            replies: m.replies,
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

    async function handleApproveMotion(motionId) {
        if (!window.confirm('Are you sure you want to approve this motion?')) return;
        try {
            const params = new URLSearchParams(location.search);
            const cid = params.get('cid'); // Use cid from URL if available, or from state if set
            if (cid) {
                await approveMotion(cid, motionId);
            } else {
                console.error('Committee ID not found for approving motion.');
                alert('Committee ID not found for approving motion.');
            }
        } catch (err) {
            console.error('Failed to approve motion:', err);
            alert('Failed to approve motion: ' + err.message);
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

        setMotions((prev) => prev.map((m) => (m.id === motionId ? { ...m, replies: [...(m.replies || []), { user: 'You', text, stance }] } : m)));
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
        const motionType = motion.type || motion.motionType || 'Main';
        const requiresDiscussion = (typeof motion.requiresDiscussion !== 'undefined') ? motion.requiresDiscussion : (motion.requires_discussion || true);
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
                                <div><strong>Type:</strong> {motionType}</div>
                                <div><strong>Vote Threshold:</strong> {voteThreshold}</div>
                                <div><strong>Requires Discussion:</strong> <span className="yes">{requiresDiscussion ? 'Yes' : 'No'}</span></div>
                                <div><strong>Status:</strong> {motion.status}</div>
                            </div>
                        </div>
                    </>
                )}

                {selectedTab === 'discussion' && (
                    <div className="discussion-wrapper">
                        <div className="discussion-overview card">
                            <h4><span style={{ marginRight: 8 }}>💬</span>Discussion Overview</h4>
                            <p className="sub">Member comments and positions on this motion</p>
                            <div className="discussion-stats">
                                {(() => {
                                    const counts = { supporting: 0, opposing: 0, neutral: 0 };
                                    (motion.replies || []).forEach(r => {
                                        const s = (r.stance || '').toLowerCase();
                                        if (s === 'pro' || s === 'support') counts.supporting++;
                                        else if (s === 'con' || s === 'opp' || s === 'opposing') counts.opposing++;
                                        else counts.neutral++;
                                    });
                                    return (
                                        <>
                                            <div className="stat">
                                                <div className="stat-count supporting">{counts.supporting}</div>
                                                <div className="stat-label">Supporting</div>
                                            </div>
                                            <div className="stat">
                                                <div className="stat-count opposing">{counts.opposing}</div>
                                                <div className="stat-label">Opposing</div>
                                            </div>
                                            <div className="stat">
                                                <div className="stat-count neutral">{counts.neutral}</div>
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
                                disabled={motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}
                            />

                            <div className="discussion-controls">
                                <div className="position-select">
                                    <label className="small-label">Your Position</label>
                                    <select value={replyStances[motion.id] || 'neutral'} onChange={(e) => handleStanceChange(motion.id, e.target.value)} className="reply-select" disabled={motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>
                                        <option value="pro">Supporting</option>
                                        <option value="con">Opposing</option>
                                        <option value="neutral">Neutral</option>
                                    </select>
                                </div>

                                <div className="post-action">
                                    <button onClick={() => addReply(motion.id)} className="post-comment-btn" disabled={motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>Post Comment</button>
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
                                    motion.replies.map((reply, idx) => (
                                        <div className="comment-item" key={idx}>
                                            <div className="comment-meta"><strong>{reply.user || reply.authorUid || 'Member'}</strong> · <span className="comment-stance">{reply.stance || 'neutral'}</span></div>
                                            <div className="comment-body">{reply.text || reply.message || ''}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {selectedTab === 'voting' && (
                    <div className="voting-section">
                        <h4>Voting</h4>
                        <div className="vote-grid">
                            <div className="vote-card yes-card">
                                <div className="vote-icon">✓</div>
                                <div className="vote-count">{VOTE_LABELS.yes}: {motion.tally?.yes || 0}</div>
                                <button className="vote-btn vote-yes" onClick={() => vote(null, motion.id, 'yes')} disabled={motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>{`Vote ${VOTE_LABELS.yes}`}</button>
                            </div>
                            <div className="vote-card no-card">
                                <div className="vote-icon">✕</div>
                                <div className="vote-count">{VOTE_LABELS.no}: {motion.tally?.no || 0}</div>
                                <button className="vote-btn vote-no" onClick={() => vote(null, motion.id, 'no')} disabled={motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>{`Vote ${VOTE_LABELS.no}`}</button>
                            </div>
                            <div className="vote-card abstain-card">
                                <div className="vote-icon">—</div>
                                <div className="vote-count">{VOTE_LABELS.abstain}: {motion.tally?.abstain || 0}</div>
                                <button className="vote-btn vote-abstain" onClick={() => vote(null, motion.id, 'abstain')} disabled={motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>{VOTE_LABELS.abstain}</button>
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
                {motions.map((motion) => (
                    <div id={`motion-${motion.id}`} key={motion.id} className={`motion motion-${(motion.status || '').toLowerCase()}`}>
                        <h2>{motion.title}</h2>
                        <p><strong>Description:</strong> {motion.description}</p>
                        <p><strong>Creator:</strong> {motion.creator} <span style={{ marginLeft: 12, color: 'var(--text)', opacity: 0.85 }}>{formatDateField(motion.createdAt)}</span></p>
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
                            {motion.status === 'active' && isCommitteeOwner && (
                                <button className="close-voting-btn" onClick={() => handleCloseMotionVoting(motion.id)}>Close Voting</button>
                            )}
                            {motion.status === 'closed' && isCommitteeOwner && (
                                <button className="approve-motion-btn" onClick={() => handleApproveMotion(motion.id)}>Approve Motion</button>
                            )}
                        </div>

                        <div className="replies">
                            <h3>Discussion</h3>
                            {(!motion.replies || motion.replies.length === 0) ? (
                                <div className="no-replies">No replies yet.</div>
                            ) : (
                                motion.replies.map((reply, idx) => (
                                    <div className="reply" key={idx}>
                                        <strong>{reply.user || reply.authorUid} ({reply.stance || 'neutral'}):</strong> {reply.text || reply.message || ''}
                                    </div>
                                ))
                            )}

                            <div className="reply-form">
                                <input
                                    type="text"
                                    placeholder="Add a reply..."
                                    value={replyInputs[motion.id] || ''}
                                    onChange={(e) => handleInputChange(motion.id, e.target.value)}
                                    className="reply-input"
                                    disabled={motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}
                                />
                                <select value={replyStances[motion.id] || 'pro'} onChange={(e) => handleStanceChange(motion.id, e.target.value)} className="reply-select" disabled={motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>
                                    <option value="pro">Pro</option>
                                    <option value="con">Con</option>
                                    <option value="neutral">Neutral</option>
                                </select>
                                <button onClick={() => addReply(motion.id)} className="reply-button" disabled={motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>Add Reply</button>
                            </div>
                        </div>

                        <div className="voting">
                            <h4>Vote</h4>
                            <div className="vote-grid">
                                <div className="vote-card yes-card">
                                    <div className="vote-icon">✓</div>
                                    <div className="vote-count">{VOTE_LABELS.yes}: {motion.tally?.yes || 0}</div>
                                    <button className="vote-btn vote-yes" onClick={() => vote(null, motion.id, 'yes')} disabled={motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>{`Vote ${VOTE_LABELS.yes}`}</button>
                                </div>

                                <div className="vote-card no-card">
                                    <div className="vote-icon">✕</div>
                                    <div className="vote-count">{VOTE_LABELS.no}: {motion.tally?.no || 0}</div>
                                    <button className="vote-btn vote-no" onClick={() => vote(null, motion.id, 'no')} disabled={motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>{`Vote ${VOTE_LABELS.no}`}</button>
                                </div>

                                <div className="vote-card abstain-card">
                                    <div className="vote-icon">—</div>
                                    <div className="vote-count">{VOTE_LABELS.abstain}: {motion.tally?.abstain || 0}</div>
                                    <button className="vote-btn vote-abstain" onClick={() => vote(null, motion.id, 'abstain')} disabled={motion.status === 'closed' || motion.status === 'completed' || motion.status === 'deleted'}>{VOTE_LABELS.abstain}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}