// File: src/firebase/committees.js

import { db, auth } from './firebase';
import { updateProfile } from 'firebase/auth';
import {
    collection,
    doc,
    setDoc,
    addDoc,
    updateDoc,
    serverTimestamp,
    deleteDoc,
    getDoc,
    getDocs,
    runTransaction,
    query,
    where,
} from 'firebase/firestore';

// Add a user to a committee (chair/owner only)
export async function addMemberToCommittee(
    committeeId,
    userUid,
    role = 'member'
) {
    if (!auth.currentUser) throw new Error('Not signed in');
    const memberRef = doc(db, 'committees', committeeId, 'members', userUid);
    await setDoc(
        memberRef,
        {
            uid: userUid,
            role,
            addedBy: auth.currentUser.uid,
            addedAt: serverTimestamp(),
        },
        { merge: true }
    );
}

// Change a user's role inside a committee
export async function setMemberRole(committeeId, userUid, role) {
    const committeeRef = doc(db, 'committees', committeeId);
    const memberRef = doc(db, 'committees', committeeId, 'members', userUid);

    return runTransaction(db, async tx => {
        // Read committee and (if present) previous owner member doc first
        const committeeSnap = await tx.get(committeeRef);
        if (!committeeSnap.exists()) throw new Error('Committee not found');

        const committeeData = committeeSnap.data();
        const prevOwnerUid = committeeData.ownerUid;

        // Prevent demoting the current owner to a non-owner role without assigning a new owner
        // If caller is trying to change the role of the current owner to something else (not 'owner'),
        // disallow — this avoids leaving a committee with no owner.
        if (prevOwnerUid && userUid === prevOwnerUid && role !== 'owner') {
            throw new Error('Cannot demote the committee owner without assigning a new owner first');
        }

        let prevOwnerMemberRef = null;
        let prevOwnerSnap = null;
        if (prevOwnerUid) {
            prevOwnerMemberRef = doc(db, 'committees', committeeId, 'members', prevOwnerUid);
            try {
                prevOwnerSnap = await tx.get(prevOwnerMemberRef);
            } catch (e) {
                prevOwnerSnap = null;
            }
        }

        // All reads are done — now perform writes. Use tx.set with merge to avoid failures
        tx.set(memberRef, { role }, { merge: true });

        // If assigning a new owner, update the committee ownerUid and demote previous owner
        if (role === 'owner' && prevOwnerUid !== userUid) {
            tx.update(committeeRef, { ownerUid: userUid });

            if (prevOwnerSnap && prevOwnerSnap.exists()) {
                tx.update(prevOwnerMemberRef, { role: 'member' });
            }
        }
    });
}

// Reply to motion (discussion)
export async function replyToMotion(
    committeeId,
    motionId,
    { text, stance = 'neutral' }
) {
    if (!auth.currentUser) throw new Error('Not signed in');
    // If the motion requires a second, ensure it has been seconded before allowing replies
    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);
    const motionSnap = await getDoc(motionRef);
    if (!motionSnap.exists()) throw new Error('Motion not found');
    const motionData = motionSnap.data() || {};

    // Determine whether this motion requires a second. If the motion document
    // does not specify `secondRequired`, fall back to the committee's settings.
    let requiresSecond = false;
    if (typeof motionData.secondRequired === 'boolean') {
        requiresSecond = motionData.secondRequired;
    } else {
        try {
            const committeeSnap = await getDoc(doc(db, 'committees', committeeId));
            const committeeData = committeeSnap.exists() ? committeeSnap.data() : {};
            requiresSecond = !!(committeeData.settings && (committeeData.settings.requireSecond ?? committeeData.settings.secondRequired));
        } catch (e) {
            requiresSecond = false;
        }
    }

    // Only allow discussion when either the motion does not require a second
    // or it has already been seconded.
    if (requiresSecond && !motionData.seconded) {
        throw new Error('This motion requires a second before discussion can begin');
    }

    const repliesCol = collection(
        db,
        'committees',
        committeeId,
        'motions',
        motionId,
        'replies'
    );
    await addDoc(repliesCol, {
        authorUid: auth.currentUser.uid,
        authorDisplayName: auth.currentUser.displayName,
        text,
        stance,
        createdAt: serverTimestamp(),
    });
}

/**
 * Second a motion. Only committee members may second a motion. Sets
 * `seconded: true`, `secondedBy`, `secondedByName`, and `secondedAt`.
 */
export async function secondMotion(committeeId, motionId) {
    if (!auth.currentUser) throw new Error('Not signed in');

    // Verify the user is a committee member
    const memberRef = doc(db, 'committees', committeeId, 'members', auth.currentUser.uid);
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists()) throw new Error('Only committee members can second motions');

    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);

    return runTransaction(db, async tx => {
        const mSnap = await tx.get(motionRef);
        if (!mSnap.exists()) throw new Error('Motion not found');
        const data = mSnap.data() || {};

        // Prevent the motion creator from seconding their own motion
        if (data.creatorUid && data.creatorUid === auth.currentUser.uid) {
            throw new Error('Motion creators cannot second their own motion');
        }

        if (data.seconded) {
            // already seconded — no-op
            return true;
        }

        tx.update(motionRef, {
            seconded: true,
            secondedBy: auth.currentUser.uid,
            secondedByName: auth.currentUser.displayName || auth.currentUser.email || auth.currentUser.uid,
            secondedAt: serverTimestamp(),
        });

        return true;
    });
}

// Cast a vote with optional anonymous flag
export async function castVote(
    committeeId,
    motionId,
    { choice, anonymous = false }
) {
    if (!auth.currentUser) throw new Error('Not signed in');



    const voteRef = doc(
        db,
        'committees',
        committeeId,
        'motions',
        motionId,
        'votes',
        auth.currentUser.uid
    );
    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);

    return runTransaction(db, async tx => {
        const motionSnap = await tx.get(motionRef);
        if (!motionSnap.exists()) throw new Error('Motion not found');

        const motionData = motionSnap.data();
        // If this motion requires a second, do not allow voting until it's seconded.
        // Fall back to committee settings if the motion document doesn't specify it.
        let requiresSecond = false;
        if (typeof motionData.secondRequired === 'boolean') {
            requiresSecond = motionData.secondRequired;
        } else {
            try {
                const committeeSnap = await getDoc(doc(db, 'committees', committeeId));
                const committeeData = committeeSnap.exists() ? committeeSnap.data() : {};
                requiresSecond = !!(committeeData.settings && (committeeData.settings.requireSecond ?? committeeData.settings.secondRequired));
            } catch (e) {
                requiresSecond = false;
            }
        }

        if (requiresSecond && !motionData.seconded) {
            throw new Error('This motion requires a second before voting');
        }
        const counts = { ...(motionData.tally || { yes: 0, no: 0, abstain: 0 }) };

        const existingSnap = await tx.get(voteRef);

        if (existingSnap.exists()) {
            const prevChoice = existingSnap.data().choice;

            if (prevChoice === choice) {
                return counts;
            }

            // Decrement previous
            if (prevChoice === 'yes') counts.yes = Math.max(0, (counts.yes || 0) - 1);
            else if (prevChoice === 'no')
                counts.no = Math.max(0, (counts.no || 0) - 1);
            else counts.abstain = Math.max(0, (counts.abstain || 0) - 1);

            // Increment new
            if (choice === 'yes') counts.yes = (counts.yes || 0) + 1;
            else if (choice === 'no') counts.no = (counts.no || 0) + 1;
            else counts.abstain = (counts.abstain || 0) + 1;

            tx.update(voteRef, {
                voterUid: auth.currentUser.uid,
                voterDisplayName: anonymous
                    ? null
                    : auth.currentUser.displayName ||
                    auth.currentUser.email ||
                    auth.currentUser.uid,
                choice,
                anonymous,
                updatedAt: serverTimestamp(),
            });

            tx.update(motionRef, { tally: counts });
            return counts;
        } else {
            // First time vote
            if (choice === 'yes') counts.yes = (counts.yes || 0) + 1;
            else if (choice === 'no') counts.no = (counts.no || 0) + 1;
            else counts.abstain = (counts.abstain || 0) + 1;

            tx.set(voteRef, {
                voterUid: auth.currentUser.uid,
                voterDisplayName: anonymous
                    ? null
                    : auth.currentUser.displayName ||
                    auth.currentUser.email ||
                    auth.currentUser.uid,
                choice,
                anonymous,
                createdAt: serverTimestamp(),
            });

            tx.update(motionRef, { tally: counts });
            return counts;
        }
    });
}

// Record a final decision with summary, pros, cons, and discussion snapshot
export async function recordDecision(
    committeeId,
    motionId,
    { summary = '', pros = [], cons = [], recordingUrl = null }
) {
    if (!auth.currentUser) throw new Error('Not signed in');

    // Fetch all replies to snapshot discussion
    const repliesCol = collection(
        db,
        'committees',
        committeeId,
        'motions',
        motionId,
        'replies'
    );
    const repliesSnap = await getDocs(repliesCol);
    const discussionSnapshot = repliesSnap.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt
            ? doc.data().createdAt.toDate
                ? doc.data().createdAt.toDate().toISOString()
                : String(doc.data().createdAt)
            : null,
    }));

    // Create decision doc
    const decisionsCol = collection(db, 'committees', committeeId, 'decisions');
    const decisionRef = await addDoc(decisionsCol, {
        motionId,
        summary,
        pros: Array.isArray(pros) ? pros : (pros || '').split('\n').filter(Boolean),
        cons: Array.isArray(cons) ? cons : (cons || '').split('\n').filter(Boolean),
        discussionSnapshot,
        recordingUrl,
        recordedBy: auth.currentUser.uid,
        recordedByName:
            auth.currentUser.displayName || auth.currentUser.email || '',
        createdAt: serverTimestamp(),
    });

    // Mark motion as decided
    await updateDoc(doc(db, 'committees', committeeId, 'motions', motionId), {
        status: 'decided',
        decidedAt: serverTimestamp(),
        decisionId: decisionRef.id,
    });

    return decisionRef.id;
}

// Update decision with overturn result
export async function updateDecisionOverturnStatus(committeeId, decisionId, overturnMotionId, isOverturned) {
    if (!auth.currentUser) throw new Error("Not signed in");

    const decisionRef = doc(db, "committees", committeeId, "decisions", decisionId);
    await updateDoc(decisionRef, {
        overturnMotionId,
        isOverturned,
        overturnedAt: isOverturned ? serverTimestamp() : null,
    });
}

// Propose an overturn motion (only for users who voted 'yes' on original)
export async function proposeOverturn(
    committeeId,
    originalMotionId,
    { title, description }
) {
    if (!auth.currentUser) throw new Error('Not signed in');

    const myVoteRef = doc(
        db,
        'committees',
        committeeId,
        'motions',
        originalMotionId,
        'votes',
        auth.currentUser.uid
    );
    const myVoteSnap = await getDoc(myVoteRef);

    if (!myVoteSnap.exists() || myVoteSnap.data().choice !== 'yes') {
        throw new Error('Only members who voted in favor can propose to overturn');
    }

    return createMotion(committeeId, {
        title,
        description,
        kind: 'overturn',
        relatedTo: originalMotionId,
        requiresDiscussion: true,
        type: 'Overturn Motion',
    });
}

export async function denyMotion(committeeId, motionId) {
    if (!auth.currentUser) throw new Error("Not signed in");
    const committeeRef = doc(db, "committees", committeeId);
    const committeeSnap = await getDoc(committeeRef);
    const committeeData = committeeSnap.data();
    const ownerUid = committeeData.ownerUid;
    // Check if current user is owner or chair
    const memberRef = doc(db, "committees", committeeId, "members", auth.currentUser.uid);
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists() || !["owner", "chair"].includes(memberSnap.data().role)) {
        throw new Error("Not authorized to deny this motion");
    }

    // Check if this is an overturn motion
    const motionRef = doc(db, "committees", committeeId, "motions", motionId);
    const motionSnap = await getDoc(motionRef);

    if (motionSnap.exists()) {
        const motionData = motionSnap.data();

        await updateDoc(motionRef, {
            status: "denied",
            deniedAt: serverTimestamp(),
        });

        // If it's an overturn motion, update the related decision (overturn failed)
        if (motionData.kind === "overturn" && motionData.relatedDecisionId) {
            await updateDecisionOverturnStatus(
                committeeId,
                motionData.relatedDecisionId,
                motionId,
                false
            );
        }
    }

    return true;
}

// Utility: update display name
export async function updateDisplayName(newName) {
    if (!auth.currentUser) throw new Error('Not signed in');

    await updateProfile(auth.currentUser, { displayName: newName });

    try {
        await auth.currentUser.reload?.();
    } catch {}

    await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        {
            displayName: newName,
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
}

/**
 * Create a new committee and add the current user as owner member.
 */
export async function createCommittee({ name, description, settings = {} }) {
    const user = auth.currentUser;
    if (!user || !user.uid) {
        throw new Error('Not signed in');
    }

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
 * Generate a unique 6-character invite code.
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
 * Update committee settings (partial). Only owner/chair should call this from client.
 * This function writes fields under `settings.<key>` to avoid overwriting other settings.
 */
export async function updateCommitteeSettings(committeeId, updates = {}) {
    if (!auth.currentUser) throw new Error('Not signed in');
    if (!committeeId) throw new Error('No committeeId provided');

    const ref = doc(db, 'committees', committeeId);
    const payload = {};
    Object.keys(updates || {}).forEach(k => {
        payload[`settings.${k}`] = updates[k];
    });
    payload.updatedAt = serverTimestamp();

    await updateDoc(ref, payload);
    return true;
}

/**
 * Join a committee by code.
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

export async function createMotion(committeeId, motionPayload) {
    const user = auth.currentUser;
    if (!user || !user.uid) throw new Error("Not signed in");
    const motionsCol = collection(db, "committees", committeeId, "motions");
    const ref = await addDoc(motionsCol, {
        ...motionPayload,
        creatorUid: user.uid,
        creatorDisplayName: user.displayName || user.email,
        createdAt: serverTimestamp(),
        status: "active",
        tally: { yes: 0, no: 0, abstain: 0 },
    });
    return ref.id;
}

export async function deleteMotion(committeeId, motionId) {
    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);
    await updateDoc(motionRef, { status: 'deleted' });
}

// Delete a committee document. Note: this removes the committee document but
// does not recursively delete subcollections (Firestore does not support
// recursive deletes from the client). Consider a Cloud Function or admin
// script for a full cleanup if needed.
export async function deleteCommittee(committeeId) {
    if (!auth.currentUser) throw new Error('Not signed in');

    const committeeRef = doc(db, 'committees', committeeId);
    const committeeSnap = await getDoc(committeeRef);
    if (!committeeSnap.exists()) throw new Error('Committee not found');

    const committeeData = committeeSnap.data() || {};
    const ownerUid = committeeData.ownerUid;

    // Only the committee owner may delete the committee
    if (!ownerUid || ownerUid !== auth.currentUser.uid) {
        throw new Error('Only the committee owner may delete this committee');
    }

    await deleteDoc(committeeRef);
    return true;
}

export async function approveMotion(committeeId, motionId) {
    const motionRef = doc(db, "committees", committeeId, "motions", motionId);

    // Check if this is an overturn motion
    const motionSnap = await getDoc(motionRef);
    if (motionSnap.exists()) {
        const motionData = motionSnap.data();

        await updateDoc(motionRef, {
            status: "completed",
            approvedAt: serverTimestamp(),
        });

        // If it's an overturn motion, update the related decision
        if (motionData.kind === "overturn" && motionData.relatedDecisionId) {
            await updateDecisionOverturnStatus(
                committeeId,
                motionData.relatedDecisionId,
                motionId,
                true
            );
        }
    }
}

export async function closeMotionVoting(committeeId, motionId) {
    const motionRef = doc(db, 'committees', committeeId, 'motions', motionId);
    await updateDoc(motionRef, {
        status: 'closed',
        closedAt: serverTimestamp(),
    });
}
