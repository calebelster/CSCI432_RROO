// File: src/firebase/committees.js
import { db, auth } from './firebase';
import {
    collection, doc, setDoc, addDoc, updateDoc, serverTimestamp,
    getDoc, getDocs, runTransaction, query, where, deleteDoc, writeBatch
} from 'firebase/firestore';

/* Read helpers */
export async function getAllCommittees() {
    const snaps = await getDocs(collection(db, 'committees'));
    const out = [];
    for (const d of snaps.docs) {
        const data = d.data();
        const id = d.id;
        // fetch members and motions (small sets expected)
        const membersSnap = await getDocs(collection(db, 'committees', id, 'members'));
        const motionsSnap = await getDocs(collection(db, 'committees', id, 'motions'));
        const members = membersSnap.docs.map(m => ({ id: m.id, ...m.data() }));
        const motions = motionsSnap.docs.map(m => ({ id: m.id, ...m.data() }));
        out.push({ id, ...data, members, motions });
    }
    return out;
}

export async function getCommitteeById(committeeId) {
    const d = await getDoc(doc(db, 'committees', committeeId));
    if (!d.exists()) return null;
    const data = d.data();
    const membersSnap = await getDocs(collection(db, 'committees', committeeId, 'members'));
    const motionsSnap = await getDocs(collection(db, 'committees', committeeId, 'motions'));
    const members = membersSnap.docs.map(m => ({ id: m.id, ...m.data() }));
    const motions = motionsSnap.docs.map(m => ({ id: m.id, ...m.data() }));
    return { id: d.id, ...data, members, motions };
}

export async function getCommitteeByName(name) {
    const q = query(collection(db, 'committees'), where('name', '==', name));
    const snaps = await getDocs(q);
    if (snaps.empty) return null;
    // return the first matching committee
    const d = snaps.docs[0];
    return getCommitteeById(d.id);
}

/* Per-user read helpers */
export async function getUserCommittees(uid) {
    const snaps = await getDocs(collection(db, 'users', uid, 'committees'));
    const out = [];
    for (const d of snaps.docs) {
        const data = d.data();
        const id = d.id;
        const membersSnap = await getDocs(collection(db, 'users', uid, 'committees', id, 'members'));
        const motionsSnap = await getDocs(collection(db, 'users', uid, 'committees', id, 'motions'));
        const members = membersSnap.docs.map(m => ({ id: m.id, ...m.data() }));
        const motions = motionsSnap.docs.map(m => ({ id: m.id, ...m.data() }));
        out.push({ id, ...data, members, motions });
    }
    return out;
}

export async function getUserCommitteeById(uid, committeeId) {
    const d = await getDoc(doc(db, 'users', uid, 'committees', committeeId));
    if (!d.exists()) return null;
    const data = d.data();
    const membersSnap = await getDocs(collection(db, 'users', uid, 'committees', committeeId, 'members'));
    const motionsSnap = await getDocs(collection(db, 'users', uid, 'committees', committeeId, 'motions'));
    const members = membersSnap.docs.map(m => ({ id: m.id, ...m.data() }));
    const motions = motionsSnap.docs.map(m => ({ id: m.id, ...m.data() }));
    return { id: d.id, ...data, members, motions };
}

export async function getUserCommitteeByName(uid, name) {
    const q = query(collection(db, 'users', uid, 'committees'), where('name', '==', name));
    const snaps = await getDocs(q);
    if (snaps.empty) return null;
    const d = snaps.docs[0];
    return getUserCommitteeById(uid, d.id);
}

/* Delete a committee and its subcollections (members, motions and motion subcollections)
   Note: Firestore doesn't support cascading deletes via client SDK; this deletes documents iteratively.
*/
export async function deleteCommittee(committeeId) {
    // Delete committee located under the current user's namespace: /users/{uid}/committees/{committeeId}
    if (!auth.currentUser) throw new Error('Not signed in');
    const uid = auth.currentUser.uid;
    // delete members and motions under user's committee
    const membersSnap = await getDocs(collection(db, 'users', uid, 'committees', committeeId, 'members'));
    const motionsSnap = await getDocs(collection(db, 'users', uid, 'committees', committeeId, 'motions'));

    let batch = writeBatch(db);
    let ops = 0;

    for (const m of membersSnap.docs) {
        batch.delete(doc(db, 'users', uid, 'committees', committeeId, 'members', m.id));
        ops++;
        if (ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }

    for (const motionDoc of motionsSnap.docs) {
        const motionId = motionDoc.id;
        const repliesSnap = await getDocs(collection(db, 'users', uid, 'committees', committeeId, 'motions', motionId, 'replies'));
        for (const r of repliesSnap.docs) {
            batch.delete(doc(db, 'users', uid, 'committees', committeeId, 'motions', motionId, 'replies', r.id));
            ops++;
            if (ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
        }
        const votesSnap = await getDocs(collection(db, 'users', uid, 'committees', committeeId, 'motions', motionId, 'votes'));
        for (const v of votesSnap.docs) {
            batch.delete(doc(db, 'users', uid, 'committees', committeeId, 'motions', motionId, 'votes', v.id));
            ops++;
            if (ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
        }
        batch.delete(doc(db, 'users', uid, 'committees', committeeId, 'motions', motionId));
        ops++;
        if (ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }

    // finally delete the committee doc itself under the user
    batch.delete(doc(db, 'users', uid, 'committees', committeeId));
    await batch.commit();
}

/* Create a committee and add the creator as owner */
export async function createCommittee({ name, description, settings = {} }) {
    if (!auth.currentUser) throw new Error('Not signed in');
    const uid = auth.currentUser.uid;
    // create committee under the user's namespace
    const committeeRef = doc(collection(db, 'users', uid, 'committees'));
    await setDoc(committeeRef, {
        name,
        description,
        ownerUid: uid,
        settings,
        createdAt: serverTimestamp()
    });
    await setDoc(doc(db, 'users', uid, 'committees', committeeRef.id, 'members', uid), {
        uid,
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
export async function createMotion(committeeId, motion, ownerUid = null) {
    // motion: { title, description, type, threshold, anonymousVotes (bool), secondRequired, discussionStyle, ... }
    if (!auth.currentUser) throw new Error('Not signed in');
    // Write motions under the committee owner's namespace. If ownerUid is provided use it,
    // otherwise default to the current authenticated user (for committees created by self).
    const uid = ownerUid || auth.currentUser.uid;
    const motionsCol = collection(db, 'users', uid, 'committees', committeeId, 'motions');
    const docRef = await addDoc(motionsCol, {
        ...motion,
        creatorUid: auth.currentUser.uid,
        status: 'active',
        tally: { yes: 0, no: 0, abstain: 0 },
        createdAt: serverTimestamp()
    });
    return docRef.id;
}

/* Reply to motion (discussion) */
export async function replyToMotion(committeeId, motionId, { text, stance = 'neutral' }) {
    if (!auth.currentUser) throw new Error('Not signed in');
    const repliesCol = collection(db, 'committees', committeeId, 'motions', motionId, 'replies');
    await addDoc(repliesCol, {
        authorUid: auth.currentUser.uid,
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

/* Utility: change user display name (also write to users collection for quick access) */
export async function updateDisplayName(newName) {
    if (!auth.currentUser) throw new Error('Not signed in');
    // Firebase Auth update on client
    await auth.currentUser.updateProfile && auth.currentUser.updateProfile({ displayName: newName }).catch(() => { });
    // Mirror into Firestore users doc
    await setDoc(doc(db, 'users', auth.currentUser.uid), {
        displayName: newName,
        updatedAt: serverTimestamp()
    }, { merge: true });
}