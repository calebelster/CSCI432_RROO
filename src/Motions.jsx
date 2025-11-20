// javascript
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './Motions.css';
import { replyToMotion, castVote } from './firebase/committees';
import { db } from './firebase/firebase';
import { collection, onSnapshot, doc, getDocs } from 'firebase/firestore';

export default function Motions() {
    const location = useLocation();
    const [motions, setMotions] = useState([]);
    const [replyInputs, setReplyInputs] = useState({});
    const [replyStances, setReplyStances] = useState({});

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
            const docs = snap.docs.map(d => {
                const md = d.data();
                return {
                    id: d.id,
                    title: md.title || md.name || 'Untitled Motion',
                    description: md.description || '',
                    creator: md.creatorUid || md.creator || '',
                    status: md.status || 'active',
                    replies: md.replies || [], // replies may be in subcollection; separate listener needed if important
                    tally: md.tally || { yes: 0, no: 0, abstain: 0 }
                };
            }).sort((a,b) => (b.id || '').localeCompare(a.id || ''));
            setMotions(docs);
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
                            <div className="tally">
                                <span>Yes: {motion.tally?.yes || 0}</span>
                                <span>No: {motion.tally?.no || 0}</span>
                                <span>Abstain: {motion.tally?.abstain || 0}</span>
                            </div>
                            <div className="vote-actions">
                                <button onClick={() => vote(null, motion.id, 'yes')}>Yes</button>
                                <button onClick={() => vote(null, motion.id, 'no')}>No</button>
                                <button onClick={() => vote(null, motion.id, 'abstain')}>Abstain</button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}