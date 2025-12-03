import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/SignUp.css';
import { doCreateUserWithEmailAndPassword, doSendEmailVerification } from '../firebase/auth';
import { db } from '../firebase/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { auth } from '../firebase/firebase';
import { updateProfile } from 'firebase/auth';

const SignUpPage = () => {
    const navigate = useNavigate();

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [error, setError] = useState('');
    const [errorCode, setErrorCode] = useState('');
    const [triedSubmit, setTriedSubmit] = useState(false);

    const handleCreateAccount = async (e) => {
        e && e.preventDefault();
        // mark that the user attempted to submit so we can show submit-time hints
        setTriedSubmit(true);
        setError('');
        setErrorCode('');

        if (!fullName || !email || !password || !confirmPassword) {
            setError('Please fill in all fields.');
            setErrorCode('');
            return;
        }

        // Priority: password length first
        if (password.length < 6) {
            setError('Password should be at least 6 characters.');
            setErrorCode('auth/weak-password');
            return;
        }

        // Then check for mismatch
        if (password !== confirmPassword) {
            setError("Those passwords didn't match. Try again.");
            setErrorCode('mismatch');
            return;
        }

        if (isRegistering) return;
        setIsRegistering(true);
        try {
            const userCredential = await doCreateUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            // set display name
            try {
                await updateProfile(user, { displayName: fullName });
            } catch (e) {
                // non-fatal
                console.warn('updateProfile failed', e);
            }
            // optional: send email verification if helper exists
            try { await doSendEmailVerification(); } catch (e) { /* ignore */ }

            setIsModalVisible(true);
        } catch (err) {
            console.error(err);
            // store both the display message and the firebase error code so we can
            // show field-specific hints (e.g. weak-password) in the form
            setError(err.message || 'Failed to create account');
            setErrorCode(err.code || '');
        } finally {
            setIsRegistering(false);
        }
    };

    const handleCloseModal = () => {
        setIsModalVisible(false);
        navigate('/login');
    }

    return (
        <div className="signup-page">
            <div className="box">
                <h1>Create Account</h1>
                <p>Join to start managing your meets and committees</p>

                {error && !['auth/weak-password', 'mismatch'].includes(errorCode) && <div className="error">{error}</div>}

                <form className="signup-form" onSubmit={handleCreateAccount}>
                    <div className="form-group">
                        <label htmlFor="fullName">Full Name</label>
                        <input type="text" id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">Email Address</label>
                        <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <input type="password" id="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                        {triedSubmit && (['auth/weak-password', 'mismatch'].includes(errorCode) || (password.length < 6 && triedSubmit)) && (
                            <div className="hint">{errorCode === 'auth/weak-password' ? (error || 'Password should be at least 6 characters.') : (errorCode === 'mismatch' ? (error || "Those passwords didn't match. Try again.") : (password.length < 6 ? 'Password should be at least 6 characters.' : ''))}</div>
                        )}
                    </div>

                    <button className="button" type="submit" disabled={isRegistering}>
                        {isRegistering ? 'Creating...' : 'Create Account'}
                    </button>
                </form>

                <h2>Already have an account? <Link to="/login">Log In</Link></h2>
            </div>

            {isModalVisible && (
                <div id="successModal" className="modal">
                    <div className="modal-content">
                        <h2>Success!</h2>
                        <p>Your account has been created</p>
                        <button id="closeModalBtn" onClick={handleCloseModal}>OK</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default SignUpPage;