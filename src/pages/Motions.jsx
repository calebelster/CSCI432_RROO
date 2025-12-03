// javascript
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/Motions.css';
import { replyToMotion, castVote } from '../firebase/committees';
import { db } from '../firebase/firebase';
import { collection, onSnapshot, doc, getDocs, getDoc } from 'firebase/firestore';

export default function Motions() {
    const location = useLocation();
    const navigate = useNavigate();
    const [motions, setMotions] = useState([]);
    const [replyInputs, setReplyInputs] = useState({});
    const [replyStances, setReplyStances] = useState({});

    // Centralized labels for vote buttons so they can be changed in one place
    const VOTE_LABELS = {
        yes: 'Yes',
        no: 'No',
        abstain: 'Abstain'
    };

    // derive motion id and committee id (sessionStorage established by Committee view)
    useEffect(() => {
        let cid = null;
        try {
            const params = new URLSearchParams(location.search);
            const id = params.get('id');
            const raw = sessionStorage.getItem('motion_' + id);
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
                        (cm.motions || []).forEach(m => all.push(m));
                    }
                    setMotions(all);
                }
            } catch (e) {}
            return;
        }

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
                    tally: md.tally || { yes: 0, no: 0, abstain: 0 }
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

                    const docs = raw.map(m => {
                        const displayName = m.creator || (m.creatorUid && profiles[m.creatorUid]?.displayName) || '';
                        return {
                            id: m.id,
                            title: m.title,
                            description: m.description,
                            creator: displayName || (m.creatorUid || ''),
                            status: m.status,
                            replies: m.replies,
                            tally: m.tally
                        };
                    }).sort((a,b) => (b.id || '').localeCompare(a.id || ''));
                    setMotions(docs);
                } catch (e) {
                    // fallback to raw list if enrichment fails
                    const docs = raw.map(m => ({ id: m.id, title: m.title, description: m.description, creator: m.creator || (m.creatorUid || ''), status: m.status, replies: m.replies, tally: m.tally })).sort((a,b) => (b.id || '').localeCompare(a.id || ''));
                    setMotions(docs);
                }
            })();
        }, (err) => {
            console.warn('motions listener failed', err);
        });

        return () => unsub();
    }, [location.search]);

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
        } catch (e) {}
    }, [location.search]);

    return (
        <div className="motions-page">
            <button className="back-button" onClick={() => navigate(-1)} aria-label="Go back">
                <span className="back-arrow">←</span>
                <span className="back-label">Back</span>
            </button>
            <h1>Motions</h1>
            <div id="motions-container">
                {motions.map((motion) => (
                    <div id={`motion-${motion.id}`} key={motion.id} className="motion">
                        <h2>{motion.title}</h2>
                        <p><strong>Description:</strong> {motion.description}</p>
                        <p><strong>Creator:</strong> {motion.creator}</p>
                        <p><strong>Status:</strong> {motion.status}</p>

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
                                />
                                <select value={replyStances[motion.id] || 'pro'} onChange={(e) => handleStanceChange(motion.id, e.target.value)} className="reply-select">
                                    <option value="pro">Pro</option>
                                    <option value="con">Con</option>
                                    <option value="neutral">Neutral</option>
                                </select>
                                <button onClick={() => addReply(motion.id)} className="reply-button">Add Reply</button>
                            </div>
                        </div>

                        <div className="voting">
                            <h4>Vote</h4>
                            <div className="vote-grid">
                                <div className="vote-card yes-card">
                                    <div className="vote-icon">✓</div>
                                    <div className="vote-count">{VOTE_LABELS.yes}: {motion.tally?.yes || 0}</div>
                                    <button className="vote-btn vote-yes" onClick={() => vote(null, motion.id, 'yes')}>{`Vote ${VOTE_LABELS.yes}`}</button>
                                </div>

                                <div className="vote-card no-card">
                                    <div className="vote-icon">✕</div>
                                    <div className="vote-count">{VOTE_LABELS.no}: {motion.tally?.no || 0}</div>
                                    <button className="vote-btn vote-no" onClick={() => vote(null, motion.id, 'no')}>{`Vote ${VOTE_LABELS.no}`}</button>
                                </div>

                                <div className="vote-card abstain-card">
                                    <div className="vote-icon">—</div>
                                    <div className="vote-count">{VOTE_LABELS.abstain}: {motion.tally?.abstain || 0}</div>
                                    <button className="vote-btn vote-abstain" onClick={() => vote(null, motion.id, 'abstain')}>{VOTE_LABELS.abstain}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}