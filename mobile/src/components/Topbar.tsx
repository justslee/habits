/**
 * Topbar — shared header bar with brand mark + serif italic title + avatar slot.
 * Mirrors the `.topbar` pattern from the design canvas (styles.css):
 *
 *   [Logo] [serif italic title]                              [avatar pill]
 *
 * The brand mark is the Arc app logo (BrandLogo). On screens where the title is
 * the date (Daily) it reads "Sunday, April 26"; on tab screens it can read
 * "Train", "Speak", etc.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import BrandLogo from './BrandLogo';
import { colors, fonts } from '../theme';

interface Props {
  /** Italic-serif headline shown next to the mark. */
  title: string;
  /** Optional small mono caption shown below or beside the title. */
  caption?: string;
  /** Right-side slot — avatar pill by default. Pass null for none. */
  right?: React.ReactNode;
  /** Tap handler for the avatar slot. */
  onAvatarPress?: () => void;
  /** Initials shown in the default avatar pill. */
  avatarInitials?: string;
}

export default function Topbar({
  title,
  caption,
  right,
  onAvatarPress,
  avatarInitials = 'JS',
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.brand}>
        <View style={styles.markBox}>
          <BrandLogo size={32} radius={8} />
        </View>
        <View style={{ minWidth: 0, flexShrink: 1 }}>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          {!!caption && <Text style={styles.caption}>{caption}</Text>}
        </View>
      </View>
      {right === null
        ? null
        : right ?? (
            <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.85} style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarInitials}</Text>
            </TouchableOpacity>
          )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 12,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  markBox: {
    // tiny soft glow around the icon for the dark backdrop
    shadowColor: '#9B8AE8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  title: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.4,
  },
  caption: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.6,
    marginTop: 2,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.text,
  },
});
