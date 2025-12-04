import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/landing.css';

// 2. Define the functional component
function LandingPage() {
    return (
        // Only the content of the <body> should be here.
        // The <head>, <html>, and <body> tags are handled by the main index.html file and React's rendering.
        <>
            <nav className="navbar">
                <div className="navbar-left">
                    <img src="/gavel_logo.png" alt="Logo" className="logo" />
                    <span className="site-title">Robert Rules of Order</span>
                </div>
                <div className="navbar-right">
                    <Link to="/login" className="nav-btn">Log In</Link>
                    <Link to="/signup" className="nav-btn">Sign Up</Link>
                </div>
            </nav>
            <main className="main-content">
                <h1 className="main-title">Modern Meetings</h1>
                <p className="main-desc">Conduct effective, fair, and orderly meetings using digital tools built around Robert's Rules of Order. Perfect for committees, boards, and organizations.</p>
                <div className="main-buttons">
                    <Link to="/login" className="main-btn">Log In</Link>
                    <Link to="/signup" className="main-btn">Sign Up</Link>
                </div>
            </main>
            <div className="info-grid">
                <div className="info-box">
                    <div className="icon">👥</div>
                    <div className="info-title">Committee Management</div>
                    <div className="info-text">Create and manage committees with role-based access control</div>
                </div>
                <div className="info-box">
                    <div className="icon">📄</div>
                    <div className="info-title">Motion Management</div>
                    <div className="info-text">Raise, discuss, and vote on motions</div>
                </div>
                <div className="info-box">
                    <div className="icon">🗳️</div>
                    <div className="info-title">Voting System</div>
                    <div className="info-text">Anonymous or recorded voting</div>
                </div>
                <div className="info-box">
                    <div className="icon">💬</div>
                    <div className="info-title">Discussions</div>
                    <div className="info-text">Give your thoughts on whether you support a motion</div>
                </div>
                <div className="info-box">
                    <div className="icon">🔒</div>
                    <div className="info-title">Role-based Permissions</div>
                    <div className="info-text">Owner, Chair, Member, and Observer roles</div>
                </div>
                {/* Parliamentary Procedure box removed per request */}
            </div>

            <section className="how-section">
                <h2>How It Works</h2>
                <p className="how-sub">Simple steps to get your committee running smoothly</p>
                <div className="how-steps">
                    <div className="how-step">
                        <div className="step-num">1</div>
                        <div className="step-title">Create Committee</div>
                        <div className="step-desc">Set up your committee and invite members</div>
                    </div>
                    <div className="how-step">
                        <div className="step-num">2</div>
                        <div className="step-title">Assign Roles</div>
                        <div className="step-desc">Designate chairs, members, and observers</div>
                    </div>
                    <div className="how-step">
                        <div className="step-num">3</div>
                        <div className="step-title">Raise Motions</div>
                        <div className="step-desc">Submit motions for discussion and voting</div>
                    </div>
                    <div className="how-step">
                        <div className="step-num">4</div>
                        <div className="step-title">Vote</div>
                        <div className="step-desc">Vote on motions</div>
                    </div>
                </div>
            </section>
        </>
    );
}

// 3. Export the component
export default LandingPage;