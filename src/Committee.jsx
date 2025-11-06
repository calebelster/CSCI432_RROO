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

  const homeData = window.opener?.homeData || defaultHomeData;

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
    setCommitteeData((prev) => {
      const updated = { ...prev, motions: [newMotion, ...(prev.motions || [])] };
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

  function viewMotion(motion) {
    // store motion in sessionStorage and navigate to motions page
    try {
      sessionStorage.setItem('motion_' + motion.id, JSON.stringify(motion));
    } catch (e) {
      // ignore
    }
    navigate(`/motions?id=${motion.id}`);
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
        <button className="new-motion-btn" onClick={openModal}><span className="plus">+</span> New Motion</button>
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
              <button className={`filter-btn ${motionFilter === 'active' ? 'active' : ''}`} onClick={() => setMotionFilter('active')}>Active</button>
              <button className={`filter-btn ${motionFilter === 'completed' ? 'active' : ''}`} onClick={() => setMotionFilter('completed')}>Completed</button>
              <button className={`filter-btn ${motionFilter === 'all' ? 'active' : ''}`} onClick={() => setMotionFilter('all')}>All</button>
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

              <div className="form-row form-row-inline">
                <input type="checkbox" id="requires-discussion" name="requiresDiscussion" checked={form.requiresDiscussion} onChange={(e) => setForm({ ...form, requiresDiscussion: e.target.checked })} className="form-checkbox" />
                <label htmlFor="requires-discussion" className="form-label-inline">Requires Discussion</label>
                <span className="form-help">Allow members to discuss this motion before voting</span>
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
                <button type="button" className="modal-cancel" onClick={closeModal}>Cancel</button>
                <button type="submit" className="modal-create">Create Motion</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
