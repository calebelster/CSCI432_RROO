import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './LoginPage.css';
import { doSignInWithEmailAndPassword } from './firebase/auth';

const LoginPage = () => {
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [error, setError] = useState('');
    const [passwordError, setPasswordError] = useState('');

    const handleLogin = async (e) => {
        e && e.preventDefault();
        setError('');
        if (!email || !password) {
                setError('Please enter both email and password.');
            return;
        }

        if (isSigningIn) return;
        setIsSigningIn(true);
        // clear previous errors
        setError('');
        setPasswordError('');
        try {
            await doSignInWithEmailAndPassword(email, password);
            // On success, navigate to home (or desired route)
            navigate('/home');
        } catch (err) {
            console.error(err);
            const code = err.code || '';
            // For any Firebase auth error, show a friendly message under the password input
            if (code.startsWith('auth/')) {
                setPasswordError('Cannot find account');
            } else {
                setError(err.message || 'Failed to sign in');
            }
        } finally {
            setIsSigningIn(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-box">
                <Link to="/" className="back-link">&#8592; Back to Home</Link>
                <div className="login-title">Log In</div>
                <div className="login-subtitle">Enter your email and password</div>

                <form className="login-content" onSubmit={handleLogin}>
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
                    {(passwordError || error) && (
                        <div className="error" style={{ marginTop: '6px' }}>
                            {passwordError || error}
                        </div>
                    )}
                    <div className="forgot"><a href="#">Forgot password?</a></div>

                    <button type="submit" disabled={isSigningIn}>{isSigningIn ? 'Signing in...' : 'Log In'}</button>

                    <div className="signup">
                        Don’t have an account? <Link to="/signup">Sign up</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default LoginPage;