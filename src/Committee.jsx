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
    <div className="committee-container" style={{ padding: 20 }}>
      <div className="committee-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <button className="back-btn" onClick={() => navigate('/home')} style={{ background: '#bfc3c9', color: '#222', border: 'none', borderRadius: 8, padding: '7px 18px', fontSize: '1rem', cursor: 'pointer' }}>
            ← Back
          </button>
          <div>
            <h1 id="committee-title">{committeeInfo.name}</h1>
            <p id="committee-desc">{committeeInfo.description}</p>
          </div>
        </div>
        <button className="new-motion-btn" onClick={openModal} style={{ background: '#6c7280', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
          <span style={{ marginRight: 6 }}>+</span> New Motion
        </button>
      </div>

      <div className="tab-bar" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={`tab ${activeTab === 'motions' ? 'active' : ''}`} onClick={() => setActiveTab('motions')} data-tab="motions">Motions</button>
        <button className={`tab ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')} data-tab="members">Members</button>
      </div>

      <div className="tab-content">
        {activeTab === 'motions' ? (
          <div className="motions-section">
            <div className="motions-header" style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: 8 }}>Motions</div>
            <div className="motion-filters" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className={`filter-btn ${motionFilter === 'active' ? 'active' : ''}`} onClick={() => setMotionFilter('active')}>Active</button>
              <button className={`filter-btn ${motionFilter === 'completed' ? 'active' : ''}`} onClick={() => setMotionFilter('completed')}>Completed</button>
              <button className={`filter-btn ${motionFilter === 'all' ? 'active' : ''}`} onClick={() => setMotionFilter('all')}>All</button>
            </div>
            <div className="motions-list">
              {filteredMotions.length === 0 ? (
                <div style={{ color: '#444' }}>No motions found.</div>
              ) : (
                filteredMotions.map((motion) => (
                  <div key={motion.id} className="motion-card" style={{ border: '1px solid #e3e6ea', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                    <h3 style={{ margin: 0 }}>{motion.name}</h3>
                    <p style={{ margin: '8px 0' }}>{motion.description}</p>
                    <div className="motion-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span className="creator" style={{ marginRight: 12 }}>{motion.creator}</span>
                        <span className="date">{motion.date}</span>
                      </div>
                      <button className="view-details-btn" onClick={() => viewMotion(motion)} style={{ cursor: 'pointer' }}>View Details</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="members-section">
            <div className="members-header" style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: 8 }}>Members</div>
            <table className="members-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8 }}>Name</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Position</th>
                </tr>
              </thead>
              <tbody>
                {(committeeData.members || []).map((member, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: 8 }}>{member}</td>
                    <td style={{ padding: 8 }}>Member</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(16,16,20,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => { if (e.target.className && e.target.className.includes('modal-overlay')) closeModal(); }}>
          <div className="modal-content" style={{ background: '#f6f7fa', borderRadius: 16, maxWidth: 480, width: '95vw', padding: 28, boxShadow: '0 8px 32px #0002', position: 'relative' }}>
            <button className="modal-close" onClick={closeModal} style={{ position: 'absolute', top: 18, right: 18, fontSize: '1.7rem', background: 'none', border: 'none', color: '#444', cursor: 'pointer' }}>&times;</button>
            <h2 style={{ marginTop: 0, fontSize: '1.5rem', color: '#222' }}>Create New Motion</h2>
            <p style={{ color: '#555', marginBottom: 18 }}>Submit a new motion for committee consideration</p>
            <form className="motion-form" autoComplete="off" onSubmit={handleCreateMotion}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: 4 }}>Motion Type</label>
                <select name="type" id="motion-type-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #bfc3c9' }}>
                  <option value="Main Motion" data-desc="Introduce new business for consideration">Main Motion</option>
                  <option value="Subsidiary Motion" data-desc="Modify or dispose of the main motion">Subsidiary Motion</option>
                  <option value="Privileged Motion" data-desc="Urgent matters affecting the assembly">Privileged Motion</option>
                  <option value="Incidental Motion" data-desc="Questions of procedure that arise incidentally">Incidental Motion</option>
                  <option value="Procedural Motion" data-desc="Changes to committee procedures or bylaws">Procedural Motion</option>
                </select>
                <div id="motion-type-desc" style={{ color: '#888', marginTop: 6, fontSize: '0.98em' }}>{/* description based on select */}</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: 4 }}>Motion Title *</label>
                <input name="title" type="text" required placeholder="e.g., Approve Budget for Q2 2024" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #bfc3c9' }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: 4 }}>Motion Description *</label>
                <textarea name="description" required placeholder="Provide a detailed description of the motion, including all relevant context and specifics..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #bfc3c9', minHeight: 70 }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: 4 }}>Vote Threshold Required</label>
                <select name="threshold" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #bfc3c9' }}>
                  <option value="Simple Majority">Simple Majority</option>
                  <option value="Two-Thirds">Two-Thirds</option>
                  <option value="Unanimous">Unanimous</option>
                </select>
                <small style={{ color: '#888' }}>More than 50% of votes cast</small>
              </div>

              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="requires-discussion" name="requiresDiscussion" checked={form.requiresDiscussion} onChange={(e) => setForm({ ...form, requiresDiscussion: e.target.checked })} style={{ accentColor: '#6c7280' }} />
                <label htmlFor="requires-discussion" style={{ fontWeight: 'bold' }}>Requires Discussion</label>
                <span style={{ color: '#888', fontSize: '0.95em' }}>Allow members to discuss this motion before voting</span>
              </div>

              <div style={{ marginBottom: 18, background: '#e6f0f7', borderRadius: 10, padding: 14 }}>
                <div style={{ fontWeight: 'bold', color: '#444', marginBottom: 6 }}>Committee Settings</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '1rem' }}>
                  <div><span style={{ color: '#222' }}>Second Required:</span> <span style={{ color: 'green' }}>Yes</span></div>
                  <div><span style={{ color: '#222' }}>Discussion Style:</span> <span style={{ color: '#444' }}>Offline</span></div>
                  <div><span style={{ color: '#222' }}>Anonymous Voting:</span> <span style={{ color: '#c00' }}>Not Allowed</span></div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" className="modal-cancel" onClick={closeModal} style={{ background: '#bfc3c9', color: '#222', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" className="modal-create" style={{ background: '#6c7280', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>Create Motion</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
