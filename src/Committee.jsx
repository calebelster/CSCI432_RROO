import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Committee.css';

// Committee React component converted from static committee page
export default function Committee() {
  const navigate = useNavigate();
  const location = useLocation();

  // source data fallback (mimics original window.opener.homeData)
  const defaultHomeData = {
    committeeData: {
      'Board of Directors': {
        members: ['User Initial'],
        motions: [
          {
            id: Date.now(),
            name: 'Motion Name',
            description: 'Motion Description',
            creator: 'Creator',
            date: 'Date Created',
            status: 'active',
            type: 'Main Motion',
            threshold: 'Simple Majority',
            requiresDiscussion: false,
          },
        ],
        meetings: [],
      },
    },
    committees: [{ name: 'Board of Directors', description: 'Short Committee Description' }],
    profile: { name: 'You' },
  };

  // Prefer a persisted homeData from localStorage so motions and committees persist across reloads
  const _localHomeData = (() => {
    try {
      const raw = localStorage.getItem('homeData');
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // ignore
    }
    return null;
  })();

  const homeData = window.opener?.homeData || _localHomeData || defaultHomeData;

  const getCommitteeName = () => {
    const params = new URLSearchParams(location.search);
    return params.get('name') || 'Board of Directors';
  };

  const [committeeName, setCommitteeName] = useState(getCommitteeName());
  const [committeeInfo, setCommitteeInfo] = useState(
    (homeData.committees || []).find((c) => c.name === committeeName) || { name: committeeName, description: '' }
  );
  const [committeeData, setCommitteeData] = useState(homeData.committeeData[committeeName] || { members: [], motions: [], meetings: [] });

  const [activeTab, setActiveTab] = useState('motions');
  const [motionFilter, setMotionFilter] = useState('active');

  // Modal / form state
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    type: 'Main Motion',
    title: '',
    description: '',
    threshold: 'Simple Majority',
    requiresDiscussion: false,
  });
  const [showInvite, setShowInvite] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // try to find an invite code stored on the committee (HomePage stores inviteCode at creation)
  const committeeObj = (homeData.committees || []).find((c) => c.name === committeeName) || null;
  const inviteCode = committeeObj?.inviteCode || '';

  function generateInviteCode(len = 6) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  async function copyToClipboard(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) { }
      document.body.removeChild(ta);
    }
  }

  useEffect(() => {
    // update when location.search changes
    setCommitteeName(getCommitteeName());
  }, [location.search]);

  useEffect(() => {
    setCommitteeInfo((homeData.committees || []).find((c) => c.name === committeeName) || { name: committeeName, description: '' });
    setCommitteeData(homeData.committeeData[committeeName] || { members: [], motions: [], meetings: [] });
  }, [committeeName]);

  function openModal() {
    setShowModal(true);
  }
  function closeModal() {
    setShowModal(false);
    setForm({ type: 'Main Motion', title: '', description: '', threshold: 'Simple Majority', requiresDiscussion: false });
  }

  function handleCreateMotion(e) {
    e.preventDefault();
    const newMotion = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      name: form.title || 'Untitled Motion',
      description: form.description || '',
      creator: homeData.profile?.name || 'You',
      date: new Date().toLocaleDateString(),
      status: 'active',
      type: form.type,
      threshold: form.threshold,
      requiresDiscussion: !!form.requiresDiscussion,
    };
    // update local state
    setCommitteeData((prev) => {
      const updated = { ...prev, motions: [newMotion, ...(prev.motions || [])] };

      // persist to opener window if available (legacy flow)
      try {
        if (window.opener && window.opener.homeData) {
          window.opener.homeData.committeeData = window.opener.homeData.committeeData || {};
          window.opener.homeData.committeeData[committeeName] = updated;
          try { window.opener.localStorage.setItem('homeData', JSON.stringify(window.opener.homeData)); } catch (err) { /* ignore */ }
        }
      } catch (e) {
        // ignore cross-origin or other opener issues
      }

      // persist to this window's localStorage so data remains across reloads
      try {
        const raw = localStorage.getItem('homeData');
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.committeeData = parsed.committeeData || {};
          parsed.committeeData[committeeName] = updated;
          localStorage.setItem('homeData', JSON.stringify(parsed));
        } else {
          // create a small homeData container if none exists
          const pd = { committees: [], committeeData: {} };
          pd.committeeData[committeeName] = updated;
          try { localStorage.setItem('homeData', JSON.stringify(pd)); } catch (err) { /* ignore */ }
        }
      } catch (err) {
        // ignore storage errors
      }

      return updated;
    });
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

  // counts for filter badges
  const allCount = (committeeData.motions || []).length;
  const activeCount = (committeeData.motions || []).filter((m) => m.status === 'active').length;
  const completedCount = (committeeData.motions || []).filter((m) => m.status === 'completed').length;

  function viewMotion(motion) {
    // store motion in sessionStorage and navigate to motions page
    try {
      sessionStorage.setItem('motion_' + motion.id, JSON.stringify(motion));
    } catch (e) {
      // ignore
    }
    navigate(`/motions?id=${motion.id}`);
  }

  function performDelete() {
    // remove from window.opener.homeData if available (older flow), otherwise from localStorage
    try {
      if (window.opener && window.opener.homeData) {
        const hd = window.opener.homeData;
        hd.committees = (hd.committees || []).filter(c => c.name !== committeeName);
        if (hd.committeeData && hd.committeeData[committeeName]) delete hd.committeeData[committeeName];
        try { window.opener.localStorage.setItem('homeData', JSON.stringify(hd)); } catch (e) { }
      }
      // localStorage path
      const raw = localStorage.getItem('homeData');
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.committees = (parsed.committees || []).filter(c => c.name !== committeeName);
        if (parsed.committeeData && parsed.committeeData[committeeName]) delete parsed.committeeData[committeeName];
        localStorage.setItem('homeData', JSON.stringify(parsed));
      }
    } catch (e) { /* ignore */ }
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
            <table className="members-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Position</th>
                </tr>
              </thead>
              <tbody>
                {(committeeData.members || []).map((member, idx) => (
                  <tr key={idx}>
                    <td className="member-name">{member}</td>
                    <td className="member-pos">Member</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  <option value="Main Motion" data-desc="Introduce new business for consideration">Main Motion</option>
                  <option value="Subsidiary Motion" data-desc="Modify or dispose of the main motion">Subsidiary Motion</option>
                  <option value="Privileged Motion" data-desc="Urgent matters affecting the assembly">Privileged Motion</option>
                  <option value="Incidental Motion" data-desc="Questions of procedure that arise incidentally">Incidental Motion</option>
                  <option value="Procedural Motion" data-desc="Changes to committee procedures or bylaws">Procedural Motion</option>
                </select>
              </div>
              <div className="form-row">
                <label className="form-label">Motion Title *</label>
                <input name="title" type="text" required placeholder="e.g., Approve Budget for Q2 2024" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="form-input" />
              </div>

              <div className="form-row">
                <label className="form-label">Motion Description *</label>
                <textarea name="description" required placeholder="Provide a detailed description of the motion, including all relevant context and specifics..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="form-textarea" />
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
                <div className="settings-title">Committee Settings</div>
                <div className="settings-list">
                  <div><span className="setting-name">Second Required:</span> <span className="setting-val yes">Yes</span></div>
                  <div><span className="setting-name">Discussion Style:</span> <span className="setting-val">Offline</span></div>
                  <div><span className="setting-name">Anonymous Voting:</span> <span className="setting-val no">Not Allowed</span></div>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="modal-create">Create Motion</button>
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
                <button onClick={() => copyToClipboard((window.location.origin || '') + '/committee?name=' + encodeURIComponent(committeeName))}>Copy</button>
              </div>
            </div>
            <div className="invite-row">
              <label>Invite Code</label>
              <div className="invite-box">
                <input readOnly value={inviteCode || generateInviteCode()} />
                <button onClick={() => copyToClipboard(inviteCode || generateInviteCode())}>Copy</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
