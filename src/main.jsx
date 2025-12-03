import ReactDOM from 'react-dom/client'
import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase/firebase'

import { useState, useEffect } from 'react'

import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/Login.jsx'
import SignUpPage from './pages/SignUp.jsx'
import Footer from './components/Footer.jsx'
import HomePage from './pages/HomePage.jsx'
import Committee from './pages/Committee.jsx'
import Motions from './pages/Motions.jsx'
import Profile from './pages/Profile.jsx'

import './styles/index.css'



function App() {
    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        const unsubsribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
        })
        return () => unsubsribe();
    }, []);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <BrowserRouter>
                <div style={{ flex: 1 }}>
                    <Routes>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/" element={<LandingPage currentUser={currentUser} />} />
                        <Route path="/landing" element={<LandingPage currentUser={currentUser} />} />
                        <Route path="/home" element={<HomePage currentUser={currentUser} />} />
                        <Route path="/committee" element={<Committee currentUser={currentUser} />} />
                        <Route path="/motions" element={<Motions currentUser={currentUser} />} />
                        <Route path="/profile" element={<Profile currentUser={currentUser} />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/signup" element={<SignUpPage />} />
                        <Route path="*" element={<div>404 Not Found</div>} />
                    </Routes>
                </div>
                <Footer />
            </BrowserRouter>
        </div>
    )
}

ReactDOM.createRoot(document.getElementById('app')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)