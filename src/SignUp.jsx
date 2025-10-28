import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './SignUp.css';
import { doCreateUserWithEmailAndPassword, doSendEmailVerification } from './firebase/auth';
import { auth } from './firebase/firebase';
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

    const handleCreateAccount = async (e) => {
        e && e.preventDefault();
        setError('');

        if (!fullName || !email || !password || !confirmPassword) {
            setError('Please fill in all fields.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (isRegistering) return;
        setIsRegistering(true);
        try {
            const userCredential = await doCreateUserWithEmailAndPassword(email, password);
            // set display name
            try {
                await updateProfile(userCredential.user, { displayName: fullName });
            } catch (e) {
                // non-fatal
                console.warn('updateProfile failed', e);
            }
            // optional: send email verification if helper exists
            try { await doSendEmailVerification(); } catch (e) { /* ignore */ }

            setIsModalVisible(true);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to create account');
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

                {error && <div className="error">{error}</div>}

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