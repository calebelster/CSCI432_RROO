import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './motions.css';

// Converted from pages/home/motions.html + motions.js
export default function Motions() {
  const location = useLocation();
  const [motions, setMotions] = useState([
    {
      id: 1,
      title: 'Extend meeting time',
      description: 'Proposal to extend the current meeting by 30 minutes to finish agenda items.',
      creator: 'Alice',
      status: 'pending',
      replies: [
        { user: 'Dave', text: 'I agree we need more time.', stance: 'pro' },
        { user: 'Eve', text: 'I think we should stick to schedule.', stance: 'con' },
      ],
    },
    {
      id: 2,
      title: 'Change voting procedure',
      description: 'Proposal to switch to anonymous voting for motions requiring 2/3 approval.',
      creator: 'Bob',
      status: 'discussion',
      replies: [],
    },
  ]);

  // local controlled inputs for replies keyed by motion id
  const [replyInputs, setReplyInputs] = useState({});
  const [replyStances, setReplyStances] = useState({});

  function handleInputChange(id, value) {
    setReplyInputs((prev) => ({ ...prev, [id]: value }));
  }
  function handleStanceChange(id, value) {
    setReplyStances((prev) => ({ ...prev, [id]: value }));
  }

  function addReply(motionId) {
    const text = (replyInputs[motionId] || '').trim();
    if (!text) return;
    const stance = replyStances[motionId] || 'pro';
    setMotions((prev) => prev.map((m) => (m.id === motionId ? { ...m, replies: [...m.replies, { user: 'You', text, stance }] } : m)));
    setReplyInputs((prev) => ({ ...prev, [motionId]: '' }));
    setReplyStances((prev) => ({ ...prev, [motionId]: 'pro' }));
  }

  // If ?id=... is provided, scroll to that motion on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const id = params.get('id');
      if (id) {
        const el = document.getElementById(`motion-${id}`);
        if (el && el.scrollIntoView) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // temporarily add highlight
          el.classList.add('focused-motion');
          setTimeout(() => el.classList.remove('focused-motion'), 2200);
        }
      }
    } catch (e) {
      // ignore
    }
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
              {motion.replies.length === 0 ? (
                <div className="no-replies">No replies yet.</div>
              ) : (
                motion.replies.map((reply, idx) => (
                  <div className="reply" key={idx}>
                    <strong>{reply.user} ({reply.stance}):</strong> {reply.text}
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
          </div>
        ))}
      </div>
    </div>
  );
}
