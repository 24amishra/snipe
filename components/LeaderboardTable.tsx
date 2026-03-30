import { useState, useMemo } from 'react';
import { Text, View, Pressable, ScrollView } from 'react-native';
import { UserPlus, X } from 'lucide-react-native';
import { CATEGORIES, CATEGORY_ABBR } from '../lib/constants';
import type { LeaderboardEntry, TodayEntry } from '../lib/firestore';

interface LeaderboardTableProps {
  groupName: string;
  entries: LeaderboardEntry[];
  todayEntries?: TodayEntry[];
  isOwner?: boolean;
  currentUserId?: string;
  scoresReleased?: boolean;
  onInvite?: () => void;
  onRemoveMember?: (userId: string, username: string) => void;
}

type SortColumn = 'score' | 'avgSpeed' | string; // string for category names
type SortDir = 'desc' | 'asc';

// Column definitions for the scrollable area
const CATEGORY_COLS = CATEGORIES.map((cat) => ({
  key: cat as string,
  label: CATEGORY_ABBR[cat],
}));

function getCategoryPct(
  categoryStats: Record<string, { correct: number; total: number }> | undefined,
  category: string,
): string {
  if (!categoryStats || !categoryStats[category] || categoryStats[category].total === 0) {
    return '\u2014';
  }
  const { correct, total } = categoryStats[category];
  return `${Math.round((correct / total) * 100)}%`;
}

export default function LeaderboardTable({
  groupName,
  entries,
  todayEntries,
  isOwner,
  currentUserId,
  scoresReleased = true,
  onInvite,
  onRemoveMember,
}: LeaderboardTableProps) {
  const hasTodayData = todayEntries && todayEntries.length > 0;
  const defaultView = scoresReleased && hasTodayData ? 'today' : 'allTime';
  const [activeView, setActiveView] = useState<'today' | 'allTime'>(defaultView);
  const [sortCol, setSortCol] = useState<SortColumn>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  // Build unified rows for "Today" view
  const todayRows = useMemo(() => {
    if (activeView !== 'today') return [];

    const playedUserIds = new Set((todayEntries ?? []).map((e) => e.userId));

    // Players who played today
    const played = (todayEntries ?? []).map((e) => ({
      userId: e.userId,
      username: e.username,
      score: e.score,
      avgSpeed: e.avgSpeed,
      categoryStats: e.categoryStats,
      didPlay: true,
    }));

    // Players who didn't play
    const notPlayed = entries
      .filter((e) => !playedUserIds.has(e.userId))
      .map((e) => ({
        userId: e.userId,
        username: e.username,
        score: 0,
        avgSpeed: 0,
        categoryStats: {} as Record<string, { correct: number; total: number }>,
        didPlay: false,
      }));

    // Sort played entries
    const sortedPlayed = [...played].sort((a, b) => {
      let aVal: number, bVal: number;
      if (sortCol === 'score') {
        aVal = a.score;
        bVal = b.score;
      } else if (sortCol === 'avgSpeed') {
        aVal = a.avgSpeed;
        bVal = b.avgSpeed;
      } else {
        // Category column — sort by accuracy %
        const aCat = a.categoryStats[sortCol];
        const bCat = b.categoryStats[sortCol];
        aVal = aCat && aCat.total > 0 ? aCat.correct / aCat.total : -1;
        bVal = bCat && bCat.total > 0 ? bCat.correct / bCat.total : -1;
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });

    return [...sortedPlayed, ...notPlayed];
  }, [activeView, todayEntries, entries, sortCol, sortDir]);

  // Build sorted rows for "All Time" view
  const allTimeRows = useMemo(() => {
    if (activeView !== 'allTime') return [];

    return [...entries].sort((a, b) => {
      let aVal: number, bVal: number;
      if (sortCol === 'score') {
        aVal = a.totalScore;
        bVal = b.totalScore;
      } else if (sortCol === 'avgSpeed') {
        aVal = a.avgSpeed ?? 0;
        bVal = b.avgSpeed ?? 0;
      } else {
        // Category column
        const aCat = a.categoryStats?.[sortCol];
        const bCat = b.categoryStats?.[sortCol];
        aVal = aCat && aCat.total > 0 ? aCat.correct / aCat.total : -1;
        bVal = bCat && bCat.total > 0 ? bCat.correct / bCat.total : -1;
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [activeView, entries, sortCol, sortDir]);

  // Compute average score for the red line
  const avgScore = useMemo(() => {
    if (activeView === 'today') {
      const played = todayRows.filter((r) => r.didPlay);
      if (played.length === 0) return 0;
      return played.reduce((sum, r) => sum + r.score, 0) / played.length;
    } else {
      if (allTimeRows.length === 0) return 0;
      return allTimeRows.reduce((sum, r) => sum + r.totalScore, 0) / allTimeRows.length;
    }
  }, [activeView, todayRows, allTimeRows]);

  const rows = activeView === 'today' ? todayRows : allTimeRows;

  // Find where the red line should go (between rows that straddle the average)
  const redLineIndex = useMemo(() => {
    if (rows.length === 0) return -1;
    // Only consider "played" rows for today view
    const scores = rows.map((r) => {
      if (activeView === 'today') {
        return (r as typeof todayRows[number]).didPlay ? (r as typeof todayRows[number]).score : -1;
      }
      return (r as LeaderboardEntry).totalScore;
    });

    // Find the first index where score drops below average
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] < avgScore) return i;
    }
    return -1; // everyone is above average
  }, [rows, avgScore, activeView]);

  const COL_WIDTH = 52;
  const SPEED_COL_WIDTH = 56;

  const renderSortHeader = (label: string, col: SortColumn, width: number) => {
    const isActive = sortCol === col;
    const arrow = isActive ? (sortDir === 'desc' ? '\u25BC' : '\u25B2') : '';
    return (
      <Pressable key={col} onPress={() => handleSort(col)} style={{ width, alignItems: 'center' }}>
        <Text
          style={{
            fontFamily: 'Urbanist_700Bold',
            fontSize: 11,
            color: isActive ? '#FFFFFF' : '#888888',
          }}
        >
          {label}{arrow ? ` ${arrow}` : ''}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ marginBottom: 40 }}>
      {/* Group name + invite */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            fontFamily: 'Urbanist_700Bold',
            fontSize: 20,
            color: '#FFFFFF',
            flex: 1,
          }}
          numberOfLines={1}
        >
          {groupName}
        </Text>
        {onInvite && (
          <Pressable onPress={onInvite} hitSlop={12}>
            <UserPlus color="#FFFFFF" size={20} />
          </Pressable>
        )}
      </View>

      {/* Today / All Time toggle */}
      <View style={{ flexDirection: 'row', marginBottom: 12, gap: 8 }}>
        <Pressable
          onPress={() => {
            setActiveView('today');
            setSortCol('score');
            setSortDir('desc');
          }}
          style={{
            backgroundColor: activeView === 'today' ? '#FFFFFF' : '#1A1A1A',
            borderRadius: 100,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              fontFamily: 'Urbanist_700Bold',
              fontSize: 13,
              color: activeView === 'today' ? '#000000' : '#888888',
            }}
          >
            Today
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setActiveView('allTime');
            setSortCol('score');
            setSortDir('desc');
          }}
          style={{
            backgroundColor: activeView === 'allTime' ? '#FFFFFF' : '#1A1A1A',
            borderRadius: 100,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              fontFamily: 'Urbanist_700Bold',
              fontSize: 13,
              color: activeView === 'allTime' ? '#000000' : '#888888',
            }}
          >
            All Time
          </Text>
        </Pressable>
      </View>

      <View style={{ height: 1, backgroundColor: '#1A1A1A', marginBottom: 4 }} />

      {/* Table */}
      <View style={{ flexDirection: 'row' }}>
        {/* Fixed left column: Rank + Username */}
        <View style={{ width: 130 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4 }}>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 11, color: '#888888', width: 30 }}>
              #
            </Text>
            <Text style={{ fontFamily: 'Urbanist_700Bold', fontSize: 11, color: '#888888' }}>
              Player
            </Text>
          </View>
          {/* Rows */}
          {rows.map((row, index) => {
            const isMe = row.userId === currentUserId;
            const isTodayRow = activeView === 'today';
            const didPlay = isTodayRow ? (row as typeof todayRows[number]).didPlay : true;
            const showRedLine = index === redLineIndex;

            return (
              <View key={row.userId}>
                {showRedLine && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 2 }}>
                    <Text style={{ fontFamily: 'Urbanist_400Regular', fontSize: 9, color: '#EF4444', marginRight: 4 }}>
                      avg
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: '#EF4444' }} />
                  </View>
                )}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 4,
                    backgroundColor: index % 2 === 0 ? '#000000' : '#080808',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Urbanist_400Regular',
                      fontSize: 13,
                      color: didPlay ? '#888888' : '#444444',
                      width: 30,
                    }}
                  >
                    {scoresReleased && didPlay
                      ? index === 0
                        ? '\u{1F451}'
                        : `${index + 1}`
                      : '#?'}
                  </Text>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <Text
                      style={{
                        fontFamily: 'Urbanist_700Bold',
                        fontSize: 14,
                        color: didPlay ? '#FFFFFF' : '#444444',
                        flex: 1,
                      }}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {row.username}
                    </Text>
                    {isOwner && !isMe && onRemoveMember && (
                      <Pressable
                        onPress={() => onRemoveMember(row.userId, row.username)}
                        hitSlop={8}
                        style={{ marginLeft: 4 }}
                      >
                        <X color="#888888" size={14} />
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* Scrollable right columns */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View>
            {/* Header row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
              {renderSortHeader('Score', 'score', COL_WIDTH)}
              {CATEGORY_COLS.map((col) => renderSortHeader(col.label, col.key, COL_WIDTH))}
              {renderSortHeader('Spd', 'avgSpeed', SPEED_COL_WIDTH)}
            </View>

            {/* Data rows */}
            {rows.map((row, index) => {
              const isTodayRow = activeView === 'today';
              const didPlay = isTodayRow ? (row as typeof todayRows[number]).didPlay : true;
              const isMe = row.userId === currentUserId;
              const showStats = scoresReleased || isMe;
              const showRedLine = index === redLineIndex;

              const score = isTodayRow
                ? (row as typeof todayRows[number]).score
                : (row as LeaderboardEntry).totalScore;
              const avgSpeed = isTodayRow
                ? (row as typeof todayRows[number]).avgSpeed
                : ((row as LeaderboardEntry).avgSpeed ?? 0);
              const catStats = isTodayRow
                ? (row as typeof todayRows[number]).categoryStats
                : (row as LeaderboardEntry).categoryStats;

              return (
                <View key={row.userId}>
                  {showRedLine && (
                    <View style={{ height: 5 }} />
                  )}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 10,
                      backgroundColor: index % 2 === 0 ? '#000000' : '#080808',
                    }}
                  >
                    {/* Score */}
                    <View style={{ width: COL_WIDTH, alignItems: 'center' }}>
                      <Text
                        style={{
                          fontFamily: 'Urbanist_700Bold',
                          fontSize: 13,
                          color: didPlay && showStats ? '#FFFFFF' : '#444444',
                        }}
                      >
                        {didPlay && showStats ? score : '\u2014'}
                      </Text>
                    </View>

                    {/* Category columns */}
                    {CATEGORY_COLS.map((col) => (
                      <View key={col.key} style={{ width: COL_WIDTH, alignItems: 'center' }}>
                        <Text
                          style={{
                            fontFamily: 'Urbanist_400Regular',
                            fontSize: 12,
                            color: didPlay && showStats ? '#AAAAAA' : '#444444',
                          }}
                        >
                          {didPlay && showStats ? getCategoryPct(catStats, col.key) : '\u2014'}
                        </Text>
                      </View>
                    ))}

                    {/* Avg Speed */}
                    <View style={{ width: SPEED_COL_WIDTH, alignItems: 'center' }}>
                      <Text
                        style={{
                          fontFamily: 'Urbanist_400Regular',
                          fontSize: 12,
                          color: didPlay && showStats ? '#AAAAAA' : '#444444',
                        }}
                      >
                        {didPlay && showStats && avgSpeed > 0
                          ? `${avgSpeed.toFixed(1)}s`
                          : '\u2014'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
