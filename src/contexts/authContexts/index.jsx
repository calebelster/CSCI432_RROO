import React, { useContext, useState, useEffect, useCallback } from 'react';
import { auth, db } from '../../firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = React.createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [userLoggedIn, setUserLoggedIn] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, initalizedUser);
        return unsubscribe;
    }, [])

    async function initalizedUser(user) {
        if (user) {
            setCurrentUser(user);
            setUserLoggedIn(true);
        } else {
            setCurrentUser(null);
            setUserLoggedIn(false);
        }
        setLoading(false);
    }

    // Get this user's role for a specific committee (owner/chair/member)
    const getMemberRole = useCallback(async (committeeId) => {
        if (!committeeId || !auth.currentUser) return null;
        try {
            const ref = doc(db, 'committees', committeeId, 'members', auth.currentUser.uid);
            const snap = await getDoc(ref);
            if (!snap.exists()) return null;
            const data = snap.data();
            return data.role || null;
        } catch (e) {
            console.warn('getMemberRole failed', e);
            return null;
        }
    }, []);

    const hasRole = useCallback(async (committeeId, roles) => {
        const role = await getMemberRole(committeeId);
        if (!role) return false;
        if (Array.isArray(roles)) return roles.includes(role);
        return role === roles;
    }, [getMemberRole]);
    const value = {
        currentUser,
        userLoggedIn,
        loading,
        getMemberRole,
        hasRole,
    }
    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    )
}