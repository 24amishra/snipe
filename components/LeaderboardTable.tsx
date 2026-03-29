import { Text, View, Pressable } from 'react-native';
import { UserPlus, X } from 'lucide-react-native';

interface LeaderboardEntry {
  userId: string;
  username: string;
  score: number;
  wins: number;
  streak: number;
  avgPct: number;
}

interface LeaderboardTableProps {
  groupName: string;
  entries: LeaderboardEntry[];
  isOwner?: boolean;
  currentUserId?: string;
  scoresReleased?: boolean;
  onInvite?: () => void;
  onRemoveMember?: (userId: string, username: string) => void;
}

export default function LeaderboardTable({
  groupName,
  entries,
  isOwner,
  currentUserId,
  scoresReleased = true,
  onInvite,
  onRemoveMember,
}: LeaderboardTableProps) {
  return (
    <View style={{ marginBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text
          style={{
            fontFamily: 'Urbanist_700Bold',
            fontSize: 20,
            color: '#FFFFFF',
          }}
        >
          {groupName}
        </Text>
        {isOwner && onInvite && (
          <Pressable onPress={onInvite} hitSlop={12}>
            <UserPlus color="#FFFFFF" size={20} />
          </Pressable>
        )}
      </View>
      <View style={{ height: 1, backgroundColor: '#1A1A1A', marginBottom: 8 }} />

      {entries.map((entry, index) => {
        const isMe = entry.userId === currentUserId;
        const showStats = scoresReleased || isMe;
        return (
          <View
            key={entry.userId}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 14,
              paddingHorizontal: 12,
              backgroundColor: index % 2 === 0 ? '#000000' : '#080808',
            }}
          >
            <Text
              style={{
                fontFamily: 'Urbanist_400Regular',
                fontSize: 14,
                color: '#888888',
                width: 36,
              }}
            >
              {scoresReleased ? (index === 0 ? '\u{1F451}' : `#${index + 1}`) : (isMe ? '#?' : '#?')}
            </Text>

            <Text
              style={{
                fontFamily: 'Urbanist_700Bold',
                fontSize: 16,
                color: '#FFFFFF',
                flex: 1,
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {entry.username}
            </Text>

            <Text
              style={{
                fontFamily: 'Urbanist_400Regular',
                fontSize: 14,
                color: '#FFFFFF',
                width: 48,
                textAlign: 'right',
              }}
            >
              {showStats ? `${entry.wins}W` : '\u2014'}
            </Text>

            <Text
              style={{
                fontFamily: 'Urbanist_400Regular',
                fontSize: 14,
                color: '#FFFFFF',
                width: 52,
                textAlign: 'right',
              }}
            >
              {showStats ? (entry.streak > 0 ? `${entry.streak}\u{1F525}` : `${entry.streak}`) : '\u2014'}
            </Text>

            <Text
              style={{
                fontFamily: 'Urbanist_400Regular',
                fontSize: 14,
                color: '#888888',
                width: 48,
                textAlign: 'right',
              }}
            >
              {showStats ? `${entry.avgPct}%` : '\u2014'}
            </Text>

            {isOwner && !isMe && onRemoveMember && (
              <Pressable
                onPress={() => onRemoveMember(entry.userId, entry.username)}
                hitSlop={8}
                style={{ marginLeft: 12 }}
              >
                <X color="#888888" size={16} />
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}
