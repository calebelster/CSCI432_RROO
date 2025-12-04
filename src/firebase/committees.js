// File: src/firebase/committees.js
import { db, auth } from './firebase';
import { updateProfile } from 'firebase/auth';
import {
    collection, doc, setDoc, addDoc, updateDoc, serverTimestamp, deleteDoc,
    getDoc, getDocs, runTransaction, query, where
} from 'firebase/firestore';

/* Add a user to a committee (chair/owner only UI should call this) */
export async function addMemberToCommittee(committeeId, userUid, role = 'member') {
    if (!auth.currentUser) throw new Error('Not signed in');
    const memberRef = doc(db, 'committees', committeeId, 'members', userUid);
    await setDoc(memberRef, {
        uid: userUid,
        role,
        addedBy: auth.currentUser.uid,
        addedAt: serverTimestamp()
    }, { merge: true });
}

/* Change a user's role inside a committee */
export async function setMemberRole(committeeId, userUid, role) {
    const memberRef = doc(db, 'committees', committeeId, 'members', userUid);
    await updateDoc(memberRef, { role });
}

/* Reply to motion (discussion) */
export async function replyToMotion(committeeId, motionId, { text, stance = 'neutral' }) {
    if (!auth.currentUser) throw new Error('Not signed in');
    const repliesCol = collection(db, 'committees', committeeId, 'motions', motionId, 'replies');
    await addDoc(repliesCol, {
        authorUid: auth.currentUser.uid,
        authorDisplayName: auth.currentUser.displayName,
        text,
        stance,
        createdAt: serverTimestamp()
    });
}

/* Cast a vote - transaction ensures single vote per user but allows changing that vote */
export async function castVote(committeeId, motionId, { choice, anonymous = false }) {
    if (!auth.currentUser) throw new Error('Not signed in');
    const voteRef = doc(db, 'committees', committeeId, 'motions', motionId, 'votes', auth.currentUser.uid);
    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);

    // Transaction: create or update the user's vote and adjust tallies accordingly.
    return runTransaction(db, async (tx) => {
        const motionSnap = await tx.get(motionRef);
        if (!motionSnap.exists()) throw new Error('Motion not found');
        const motionData = motionSnap.data();
        const counts = { ...(motionData.tally || { yes: 0, no: 0, abstain: 0 }) };

        const existingSnap = await tx.get(voteRef);
        if (existingSnap.exists()) {
            const prevChoice = existingSnap.data().choice;
            if (prevChoice === choice) {
                // No-op (same selection) but return current counts
                return counts;
            }
            // decrement previous
            if (prevChoice === 'yes') counts.yes = Math.max(0, (counts.yes || 0) - 1);
            else if (prevChoice === 'no') counts.no = Math.max(0, (counts.no || 0) - 1);
            else counts.abstain = Math.max(0, (counts.abstain || 0) - 1);

            // increment new
            if (choice === 'yes') counts.yes = (counts.yes || 0) + 1;
            else if (choice === 'no') counts.no = (counts.no || 0) + 1;
            else counts.abstain = (counts.abstain || 0) + 1;

            tx.update(voteRef, {
                voterUid: auth.currentUser.uid,
                voterDisplayName: auth.currentUser.displayName || auth.currentUser.email || auth.currentUser.uid,
                choice,
                anonymous,
                updatedAt: serverTimestamp()
            });
            tx.update(motionRef, { tally: counts });
            return counts;
        } else {
            // First time vote: set vote and update tallies
            if (choice === 'yes') counts.yes = (counts.yes || 0) + 1;
            else if (choice === 'no') counts.no = (counts.no || 0) + 1;
            else counts.abstain = (counts.abstain || 0) + 1;

            tx.set(voteRef, {
                voterUid: auth.currentUser.uid,
                voterDisplayName: auth.currentUser.displayName || auth.currentUser.email || auth.currentUser.uid,
                choice,
                anonymous,
                createdAt: serverTimestamp()
            });
            tx.update(motionRef, { tally: counts });
            return counts;
        }
    });
}

/* Record final decision + optional recording URL and summary (chair/owner) */
export async function recordDecision(committeeId, motionId, { summary, recordingUrl = null }) {
    if (!auth.currentUser) throw new Error('Not signed in');
    const decisionRef = doc(collection(db, 'committees', committeeId, 'decisions'));
    await setDoc(decisionRef, {
        motionId,
        summary,
        recordingUrl,
        recordedBy: auth.currentUser.uid,
        createdAt: serverTimestamp()
    });
    // mark motion as decided
    await updateDoc(doc(db, 'committees', committeeId, 'motions', motionId), { status: 'decided', decidedAt: serverTimestamp() });
}

/* Propose an overturn motion: client enforces only a user who voted 'yes' can create - verify via votes collection */
export async function proposeOverturn(committeeId, originalMotionId, { title, description }) {
    if (!auth.currentUser) throw new Error('Not signed in');
    const myVoteRef = doc(db, 'committees', committeeId, 'motions', originalMotionId, 'votes', auth.currentUser.uid);
    const myVoteSnap = await getDoc(myVoteRef);
    if (!myVoteSnap.exists() || myVoteSnap.data().choice !== 'yes') {
        throw new Error('Only members who voted in favor can propose to overturn');
    }
    // create a special motion referencing original
    return createMotion(committeeId, { title, description, type: 'overturn', relatedTo: originalMotionId });
}

/* Deny a motion (committee owner) */
export async function denyMotion(committeeId, motionId) {
    if (!auth.currentUser) throw new Error('Not signed in');

    const committeeRef = doc(db, 'committees', committeeId);
    const committeeSnap = await getDoc(committeeRef);
    const committeeData = committeeSnap.data();
    const ownerUid = committeeData.ownerUid;

    if (auth.currentUser.uid !== ownerUid) {
        throw new Error('Not authorized to deny this motion');
    }

    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);
    await updateDoc(motionRef, {
        status: 'denied',
        deniedAt: serverTimestamp()
    });
    return true;
}

/* Utility: change user display name (also write to users collection for quick access) */
export async function updateDisplayName(newName) {
    if (!auth.currentUser) throw new Error('Not signed in');
    // Firebase Auth update (modular SDK)
    await updateProfile(auth.currentUser, { displayName: newName });
    // Ensure local user reflects changes immediately
    try { await auth.currentUser.reload?.(); } catch { }
    // Mirror into Firestore users doc
    await setDoc(doc(db, 'users', auth.currentUser.uid), {
        displayName: newName,
        updatedAt: serverTimestamp()
    }, { merge: true });
}

/**
 * Create a new committee and add the current user as owner member.
 */
export async function createCommittee({ name, description, settings = {} }) {
    const user = auth.currentUser;
    if (!user || !user.uid) {
        throw new Error('Not signed in');
    }

    // Create the committee document
    const committeesCol = collection(db, 'committees');
    const committeeRef = await addDoc(committeesCol, {
        name,
        description,
        ownerUid: user.uid,
        settings,
        createdAt: serverTimestamp(),
        inviteCode: null,
    });

    const committeeId = committeeRef.id;

    // Create owner membership document with denormalized profile
    const ownerDisplayName = user.displayName || user.email || '';
    const ownerEmail = user.email || '';

    await setDoc(
        doc(db, 'committees', committeeId, 'members', user.uid),
        {
            uid: user.uid,
            role: 'owner',
            displayName: ownerDisplayName,
            email: ownerEmail,
            joinedAt: serverTimestamp(),
        },
        { merge: true }
    );

    return committeeId;
}

/**
 * Generate a unique 6-character invite code and store it on the committee doc.
 */
function randomInviteCode() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i += 1) {
        code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return code;
}

export async function generateUniqueInviteCode(committeeId) {
    let code = '';
    let unique = false;

    // Try a few times to avoid unlikely collisions
    for (let i = 0; i < 10 && !unique; i += 1) {
        code = randomInviteCode();
        const q = query(
            collection(db, 'committees'),
            where('inviteCode', '==', code)
        );
        const snap = await getDocs(q);
        unique = snap.empty;
    }

    if (!unique) {
        throw new Error('Could not generate unique invite code.');
    }

    const ref = doc(db, 'committees', committeeId);
    await updateDoc(ref, { inviteCode: code });
    return code;
}

/**
 * Join a committee by a 6-character invite code.
 */
export async function joinCommitteeByCode(rawCode) {
    const code = rawCode.trim().toUpperCase();
    if (!code) throw new Error('No code provided');

    const user = auth.currentUser;
    if (!user || !user.uid) throw new Error('Not signed in');

    const q = query(
        collection(db, 'committees'),
        where('inviteCode', '==', code)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
        throw new Error('Invalid or expired code.');
    }

    const committeeDoc = snap.docs[0];
    const committeeId = committeeDoc.id;
    const data = committeeDoc.data();

    const memberRef = doc(db, 'committees', committeeId, 'members', user.uid);
    await setDoc(
        memberRef,
        {
            uid: user.uid,
            role: 'member',
            displayName: user.displayName || user.email || '',
            email: user.email || '',
            joinedAt: serverTimestamp(),
        },
        { merge: true }
    );

    return { committeeId, committeeName: data.name || '' };
}

/**
 * Existing helpers (stubs; keep your implementations and ensure they
 * import from here where used in Committee/Motions components).
 */
export async function createMotion(committeeId, motionPayload) {
    const user = auth.currentUser;
    if (!user || !user.uid) {
        throw new Error('Not signed in');
    }

    const motionsCol = collection(db, 'committees', committeeId, 'motions');
    const ref = await addDoc(motionsCol, {
        ...motionPayload,
        creatorUid: user.uid,
        creatorDisplayName: user.displayName || user.email || '',
        createdAt: serverTimestamp(),
        status: 'active',
    });
    return ref.id;
}

export async function deleteMotion(committeeId, motionId) {
    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);
    await updateDoc(motionRef, { status: 'deleted' });
}

export async function approveMotion(committeeId, motionId) {
    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);
    await updateDoc(motionRef, {
        status: 'completed',
        approvedAt: serverTimestamp(),
    });
}

export async function closeMotionVoting(committeeId, motionId) {
    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);
    await updateDoc(motionRef, {
        status: 'closed',
        closedAt: serverTimestamp(),
    });
}

