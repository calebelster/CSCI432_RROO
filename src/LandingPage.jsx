import React from 'react';
import { Link } from 'react-router-dom';
import './landing.css';
import gavelLogo from '../public/gavel_logo.png';

// 2. Define the functional component
function LandingPage() {
    return (
        // Only the content of the <body> should be here.
        // The <head>, <html>, and <body> tags are handled by the main index.html file and React's rendering.
        <>
            <nav className="navbar">
                <div className="navbar-left">
                    <img src={gavelLogo} alt="Logo" className="logo" />
                    <span className="site-title">Robert Rules of Order</span>
                </div>
                <div className="navbar-right">
                    <Link to="/login" className="nav-btn">Log In</Link>
                    <Link to="/signup" className="nav-btn">Sign Up</Link>
                </div>
            </nav>
            <main className="main-content">
                <h1 className="main-title">Welcome to MySite</h1>
                <p className="main-desc">Your gateway to awesome features. Join us or log in to get started!</p>
                <div className="main-buttons">
                    <Link to="/login" className="main-btn">Log In</Link>
                    <Link to="/signup" className="main-btn">Sign Up</Link>
                </div>
            </main>
            <div className="info-grid">
                <div className="info-box">Box 1</div>
                <div className="info-box">Box 2</div>
                <div className="info-box">Box 3</div>
                <div className="info-box">Box 4</div>
                <div className="info-box">Box 5</div>
                <div className="info-box">Box 6</div>
            </div>
        </>
    );
}

// 3. Export the component
export default LandingPage;