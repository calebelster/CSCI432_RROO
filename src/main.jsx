import ReactDOM from 'react-dom/client'
import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import LandingPage from './LandingPage.jsx'
import LoginPage from './Login.jsx'
import SignUpPage from './SignUp.jsx'
import Footer from './Footer.jsx'
import './index.css'

function App() {
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <BrowserRouter>
                <div style={{ flex: 1 }}>
                    <Routes>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/home" element={<LandingPage />} />
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