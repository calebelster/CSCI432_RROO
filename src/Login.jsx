import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './LoginPage.css'; 

function LoginPage() {
    // 2. Use state to manage form inputs
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate(); // Hook for navigation

    const handleLogin = () => {
        // Basic validation
        if (!email || !password) {
            alert('Please enter both email and password.');
            return;
        }

        const users = JSON.parse(localStorage.getItem('users')) || [];
        const user = users.find(u => u.email === email && u.password === password);

        if (user) {
            // Success! Save user and redirect.
            localStorage.setItem('currentUser', JSON.stringify(user));
            navigate('/home'); // Redirect to the main app page
        } else {
            alert('Invalid email or password.');
        }
    };

    // 4. Return the HTML structure as JSX
    return (
        <div className="login-page">
            <div className="login-box">
                <Link to="/" className="back-link">&#8592; Back to Home</Link>
                <div className="login-title">Log In</div>
                <div className="login-subtitle">Enter your email and password</div>
                <div className="login-content">
                    <div className="login-label">Email</div>
                    <input
                        type="text"
                        id="loginEmail"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <div className="login-label">Password</div>
                    <input
                        type="password"
                        id="loginPassword"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <div className="forgot"><a href="#">Forgot password?</a></div>
                    {/* 5. Call the handleLogin function on button click */}
                    <button onClick={handleLogin}>Log In</button>
                    <div className="signup">
                        Don’t have an account? <Link to="/signup">Sign up</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;