import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './SignUp.css'; // 1. Import your new CSS file

function SignUpPage() {
    // 2. State for form inputs and modal visibility
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isModalVisible, setIsModalVisible] = useState(false);
    
    const navigate = useNavigate();

    // 3. Logic for handling account creation
    const handleCreateAccount = () => {
        // Basic validation
        if (!fullName || !email || !password || !confirmPassword) {
            alert('Please fill in all fields.');
            return;
        }
        if (password !== confirmPassword) {
            alert('Passwords do not match.');
            return;
        }

        const users = JSON.parse(localStorage.getItem('users')) || [];
        if (users.some(user => user.email === email)) {
            alert('An account with this email already exists.');
            return;
        }

        // Create and save the new user
        const newUser = { fullName, email, password };
        users.push(newUser);
        localStorage.setItem('users', JSON.stringify(users));

        // 4. Show the modal instead of alerting
        setIsModalVisible(true);
    };

    // 5. Logic to close the modal and redirect
    const handleCloseModal = () => {
        setIsModalVisible(false);
        navigate('/login'); // Redirect to login page
    };

    return (
        <>
            <div className="box">
                <h1>Create Account</h1>
                <p>Join to start managing your meets and committees</p>

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

                <button className="button" onClick={handleCreateAccount}>
                    <p>Create Account</p>
                </button>
                <h2>Already have an account?
                    <Link to="/login"> Log In</Link>
                </h2>
            </div>

            {/* 6. Conditionally render the modal */}
            {isModalVisible && (
                <div id="successModal" className="modal">
                    <div className="modal-content">
                        <h2>Success!</h2>
                        <p>Your account has been created</p>
                        <button id="closeModalBtn" onClick={handleCloseModal}>OK</button>
                    </div>
                </div>
            )}
        </>
    );
}

export default SignUpPage;