// File: src/firebase/committees.js
import { db, auth } from './firebase';
import { updateProfile } from 'firebase/auth';
import {
    collection, doc, setDoc, addDoc, updateDoc, serverTimestamp, deleteDoc,
    getDoc, getDocs, runTransaction, query, where
} from 'firebase/firestore';

/* Create a committee and add the creator as owner */
export async function createCommittee({ name, description, settings = {} }) {
    if (!auth.currentUser) throw new Error('Not signed in');
    const committeeRef = doc(collection(db, 'committees'));
    await setDoc(committeeRef, {
        name,
        description,
        ownerUid: auth.currentUser.uid,
        ownerDisplayName: auth.currentUser.displayName,
        settings,
        createdAt: serverTimestamp()
    });
    // add member document for owner - include uid field so collectionGroup queries can find members by uid
    await setDoc(doc(db, 'committees', committeeRef.id, 'members', auth.currentUser.uid), {
        uid: auth.currentUser.uid,
        role: 'owner',
        addedAt: serverTimestamp()
    });
    return committeeRef.id;
}

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

/* Create a motion in a committee */
export async function createMotion(committeeId, motion) {
    // motion: { title, description, type, threshold, anonymousVotes (bool), secondRequired, discussionStyle, voteThreshold, ... }
    if (!auth.currentUser) throw new Error('Not signed in');
    const motionsCol = collection(db, 'committees', committeeId, 'motions');
    const docRef = await addDoc(motionsCol, {
        ...motion,
        creatorUid: auth.currentUser.uid,
        creatorDisplayName: auth.currentUser.displayName,
        status: 'active',
        tally: { yes: 0, no: 0, abstain: 0 },
        createdAt: serverTimestamp(),
        // Explicitly set threshold and voteThreshold, with a default for voteThreshold
        threshold: motion.threshold || 'Simple Majority',
    });
    return docRef.id;
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

/* Delete a motion (creator or committee owner) */
export async function deleteMotion(committeeId, motionId) {
    if (!auth.currentUser) throw new Error('Not signed in');

    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);
    const motionSnap = await getDoc(motionRef);

    if (!motionSnap.exists()) {
        throw new Error('Motion not found');
    }

    const motionData = motionSnap.data();
    const creatorUid = motionData.creatorUid;

    const committeeRef = doc(db, 'committees', committeeId);
    const committeeSnap = await getDoc(committeeRef);
    const committeeData = committeeSnap.data();
    const ownerUid = committeeData.ownerUid;

    // allow creators, owners, or chairs to delete motions
    let myRole = null;
    try {
        const memberSnap = await getDoc(doc(db, 'committees', committeeId, 'members', auth.currentUser.uid));
        myRole = memberSnap.exists() ? memberSnap.data()?.role : null;
    } catch (e) { /* ignore */ }

    if (auth.currentUser.uid !== creatorUid && auth.currentUser.uid !== ownerUid && myRole !== 'chair') {
        throw new Error('Not authorized to delete this motion');
    }

    await updateDoc(motionRef, {
        status: 'deleted',
        deletedAt: serverTimestamp()
    });
    return true;
}

/* Close voting for a motion (committee owner) */
export async function closeMotionVoting(committeeId, motionId) {
    if (!auth.currentUser) throw new Error('Not signed in');

    const committeeRef = doc(db, 'committees', committeeId);
    const committeeSnap = await getDoc(committeeRef);
    const committeeData = committeeSnap.data();
    const ownerUid = committeeData.ownerUid;

    // allow owner or chairs to close voting
    try {
        const memberSnap = await getDoc(doc(db, 'committees', committeeId, 'members', auth.currentUser.uid));
        const role = memberSnap.exists() ? memberSnap.data()?.role : null;
        if (auth.currentUser.uid !== ownerUid && role !== 'chair') {
            throw new Error('Not authorized to close voting for this motion');
        }
    } catch (e) {
        throw e;
    }

    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);
    await updateDoc(motionRef, {
        status: 'closed',
        closedAt: serverTimestamp()
    });
    return true;
}

/* Approve a motion (committee owner) */
export async function approveMotion(committeeId, motionId) {
    if (!auth.currentUser) throw new Error('Not signed in');

    const committeeRef = doc(db, 'committees', committeeId);
    const committeeSnap = await getDoc(committeeRef);
    const committeeData = committeeSnap.data();
    const ownerUid = committeeData.ownerUid;

    // allow owner or chairs to approve
    try {
        const memberSnap = await getDoc(doc(db, 'committees', committeeId, 'members', auth.currentUser.uid));
        const role = memberSnap.exists() ? memberSnap.data()?.role : null;
        if (auth.currentUser.uid !== ownerUid && role !== 'chair') {
            throw new Error('Not authorized to approve this motion');
        }
    } catch (e) {
        throw e;
    }

    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);
    await updateDoc(motionRef, {
        status: 'completed',
        approvedAt: serverTimestamp()
    });
    return true;
}

/* Deny a motion (committee owner) */
export async function denyMotion(committeeId, motionId) {
    if (!auth.currentUser) throw new Error('Not signed in');

    const committeeRef = doc(db, 'committees', committeeId);
    const committeeSnap = await getDoc(committeeRef);
    const committeeData = committeeSnap.data();
    const ownerUid = committeeData.ownerUid;

    // allow owner or chairs to deny
    try {
        const memberSnap = await getDoc(doc(db, 'committees', committeeId, 'members', auth.currentUser.uid));
        const role = memberSnap.exists() ? memberSnap.data()?.role : null;
        if (auth.currentUser.uid !== ownerUid && role !== 'chair') {
            throw new Error('Not authorized to deny this motion');
        }
    } catch (e) {
        throw e;
    }

    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);
    await updateDoc(motionRef, {
        status: 'denied',
        deniedAt: serverTimestamp()
    });
    return true;
}

/* Delete an entire committee and its known subcollections (members, motions, decisions)
   Only the committee owner may delete a committee. This attempts to remove all
   documents under the committee path so the client-side collectionGroup listeners
   do not continue to surface the deleted committee via leftover member documents.
*/
export async function deleteCommittee(committeeId) {
    if (!auth.currentUser) throw new Error('Not signed in');

    const committeeRef = doc(db, 'committees', committeeId);
    const committeeSnap = await getDoc(committeeRef);
    if (!committeeSnap.exists()) throw new Error('Committee not found');
    const committeeData = committeeSnap.data();
    const ownerUid = committeeData?.ownerUid;
    if (auth.currentUser.uid !== ownerUid) {
        throw new Error('Not authorized to delete this committee');
    }

    // Delete members
    try {
        const membersCol = collection(db, 'committees', committeeId, 'members');
        const membersSnap = await getDocs(membersCol);
        for (const m of membersSnap.docs) {
            await deleteDoc(m.ref);
        }
    } catch (e) {
        // non-fatal: log and continue
        console.warn('Failed to delete some members for committee', committeeId, e);
    }

    // Delete decisions
    try {
        const decisionsCol = collection(db, 'committees', committeeId, 'decisions');
        const decisionsSnap = await getDocs(decisionsCol);
        for (const d of decisionsSnap.docs) {
            await deleteDoc(d.ref);
        }
    } catch (e) {
        console.warn('Failed to delete some decisions for committee', committeeId, e);
    }

    // Delete motions and their subcollections (votes, replies)
    try {
        const motionsCol = collection(db, 'committees', committeeId, 'motions');
        const motionsSnap = await getDocs(motionsCol);
        for (const motionDoc of motionsSnap.docs) {
            const motionId = motionDoc.id;
            // votes
            try {
                const votesCol = collection(db, 'committees', committeeId, 'motions', motionId, 'votes');
                const votesSnap = await getDocs(votesCol);
                for (const v of votesSnap.docs) await deleteDoc(v.ref);
            } catch (e) {
                console.warn('Failed to delete some votes for motion', motionId, e);
            }
            // replies
            try {
                const repliesCol = collection(db, 'committees', committeeId, 'motions', motionId, 'replies');
                const repliesSnap = await getDocs(repliesCol);
                for (const r of repliesSnap.docs) await deleteDoc(r.ref);
            } catch (e) {
                console.warn('Failed to delete some replies for motion', motionId, e);
            }

            // delete motion doc itself
            try {
                await deleteDoc(doc(db, 'committees', committeeId, 'motions', motionId));
            } catch (e) {
                console.warn('Failed to delete motion doc', motionId, e);
            }
        }
    } catch (e) {
        console.warn('Failed to enumerate motions for committee', committeeId, e);
    }

    // Finally, delete the committee document
    await deleteDoc(committeeRef);
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