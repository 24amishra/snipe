// lib/groupUtils.ts — Group ownership, invite links, and member management

import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  arrayRemove,
  increment,
} from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from './firebase';
import type { GroupDoc } from './firestore';

/**
 * Fetch the full group document by ID.
 */
export async function getGroupDoc(groupId: string): Promise<(GroupDoc & { id: string }) | null> {
  const snap = await getDoc(doc(db, 'groups', groupId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as GroupDoc) };
}

/**
 * Build a shareable invite link for a group.
 * - On mobile: uses snipe:// deep link so the app opens directly
 * - On web: uses https URL so the browser handles it
 */
export function buildInviteLink(groupId: string, inviteCode: string): string {
  if (Platform.OS === 'web') {
    return `https://snipe-psi.vercel.app/join?groupId=${groupId}&code=${inviteCode}`;
  }
  return `snipe://join?groupId=${groupId}&code=${inviteCode}`;
}

/**
 * Remove a member from a group.
 * - Removes userId from the group's memberIds array
 * - Decrements the group's memberCount
 * - Removes the groupId from the user's groupIds array
 * - Deletes the user's leaderboard entry in that group
 */
export async function removeMember(groupId: string, targetUserId: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    memberIds: arrayRemove(targetUserId),
    memberCount: increment(-1),
  });

  await updateDoc(doc(db, 'users', targetUserId), {
    groupIds: arrayRemove(groupId),
  });

  await deleteDoc(doc(db, 'groups', groupId, 'leaderboard', targetUserId));
}
