import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './LoginPage.css';
import { doSignInWithEmailAndPassword } from './firebase/auth';
import { auth } from './firebase/firebase';
import { setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';

const LoginPage = () => {
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [error, setError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [remember, setRemember] = useState(true);
    const [savePassword, setSavePassword] = useState(false); // kept for backward-compat, but we will treat remember as the save flag
    const [autoSigning, setAutoSigning] = useState(false);

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
            // set persistence according to the "remember me" checkbox
            await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
            await doSignInWithEmailAndPassword(email, password);
            // store email in cookie if user wants to remember it (not the password)
            if (remember) {
                const days = 365;
                const d = new Date();
                d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
                document.cookie = `savedEmail=${encodeURIComponent(email)};expires=${d.toUTCString()};path=/`;
            } else {
                // clear cookie
                document.cookie = 'savedEmail=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
            }
            // If the browser supports the Credential Management API and the user checked "Remember me",
            // store a PasswordCredential (this is handled by the browser and not exposed to JS later).
            try {
                if ((savePassword || remember) && navigator.credentials && navigator.credentials.store) {
                    // PasswordCredential constructor availability varies; try the standard constructor
                    try {
                        const cred = new window.PasswordCredential({ id: email, password });
                        await navigator.credentials.store(cred);
                    } catch (inner) {
                        // Some browsers don't expose PasswordCredential constructor; attempt to store a simple object
                        try {
                            await navigator.credentials.store({ id: email, password });
                        } catch (inner2) {
                            console.warn('Credential store fallback failed', inner2);
                        }
                    }
                }
            } catch (e) {
                // ignore failures (some browsers restrict this API)
                console.warn('Credential store failed', e);
            }
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

    useEffect(() => {
        // Read savedEmail cookie and pre-fill email if present
        const match = document.cookie.match(new RegExp('(^| )savedEmail=([^;]+)'));
        if (match) {
            try { setEmail(decodeURIComponent(match[2])); } catch (e) { setEmail(match[2]); }
        }
        // Try to get a stored PasswordCredential (will only work on secure contexts and supported browsers).
        (async () => {
            try {
                if (navigator.credentials && navigator.credentials.get) {
                    const cred = await navigator.credentials.get({ password: true, mediation: 'optional' });
                    if (cred && cred.type === 'password') {
                        // autofill and optionally auto-sign-in
                        setEmail(cred.id || '');
                        setPassword(cred.password || '');
                        setSavePassword(true);
                        setRemember(true);
                        // Attempt auto sign-in once (avoid loops)
                        if (!autoSigning) {
                            setAutoSigning(true);
                            try {
                                // set persistence to local so session survives
                                await setPersistence(auth, browserLocalPersistence);
                                await doSignInWithEmailAndPassword(cred.id, cred.password);
                                navigate('/home');
                            } catch (err) {
                                // if automatic sign-in fails, leave credentials filled for user to press Log In
                                console.warn('Auto sign-in failed', err);
                            } finally {
                                setAutoSigning(false);
                            }
                        }
                    }
                }
            } catch (e) {
                // ignore API errors
            }
        })();
    }, []);

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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                        <label className="remember-label">
                            <input type="checkbox" className="remember-checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                            <span>Remember me</span>
                        </label>
                        <div className="forgot"><a href="#">Forgot password?</a></div>
                    </div>

                    <button type="submit" disabled={isSigningIn} style={{ marginTop: 12 }}>{isSigningIn ? 'Signing in...' : 'Log In'}</button>

                    <div className="signup">
                        Don’t have an account? <Link to="/signup">Sign up</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default LoginPage;