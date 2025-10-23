import React from 'react'

export default function Footer() {
    return (
        <footer style={{ textAlign: 'center', padding: '1rem', borderTop: '1px solid #ddd' }}>
            <a href="https://www.netlify.com" target="_blank" rel="noopener noreferrer">
                <img
                    src="https://www.netlify.com/assets/badges/netlify-badge-color-accent.svg"
                    alt="Deploys by Netlify"
                    style={{ height: '30px' }}
                />
            </a>
        </footer>
    )
}