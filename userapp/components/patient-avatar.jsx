import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import Svg, { Circle, Path, G, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

export const AVATAR_PRESETS = [
  { id: 'preset:male-1', label: 'Classic Male', category: 'Male' },
  { id: 'preset:male-2', label: 'Curly Male', category: 'Male' },
  { id: 'preset:male-3', label: 'Specs Male', category: 'Male' },
  { id: 'preset:female-1', label: 'Wavy Female', category: 'Female' },
  { id: 'preset:female-2', label: 'Bun Female', category: 'Female' },
  { id: 'preset:female-3', label: 'Specs Female', category: 'Female' },
];

export function resolveAvatarPreset(avatarValue, gender = '') {
  if (typeof avatarValue === 'string' && avatarValue.startsWith('preset:')) {
    return avatarValue;
  }
  const g = String(gender || '').toLowerCase();
  if (g === 'female') return 'preset:female-1';
  if (g === 'male') return 'preset:male-1';
  return 'preset:neutral';
}

/**
 * Playful, modern character avatar inspired by the user's reference designs,
 * styled with GabayMed's sky-blue & soft gradient palette.
 * Automatically defaults to a Female or Male character based on `gender`
 * unless the user has chosen a specific preset or custom image URL.
 */
export function PatientAvatar({ avatar, gender, size = 96, showBlob = false }) {
  if (
    avatar &&
    typeof avatar === 'string' &&
    (/^(https?:\/\/|file:\/\/|content:\/\/|data:image\/)/i.test(avatar))
  ) {
    return (
      <View
        style={[
          styles.imageFrame,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <Image
          source={{ uri: avatar }}
          style={{ width: size - 6, height: size - 6, borderRadius: (size - 6) / 2 }}
          resizeMode="cover"
        />
      </View>
    );
  }

  const preset = resolveAvatarPreset(avatar, gender);
  const isFemale = preset.startsWith('preset:female');
  const isMale = preset.startsWith('preset:male');
  const hasGlasses = preset.endsWith('-3');
  const variant = preset.endsWith('-2') ? 2 : preset.endsWith('-3') ? 3 : 1;

  const bgTop = isFemale ? '#E0F2FE' : isMale ? '#DBEAFE' : '#E0E7FF';
  const bgBottom = isFemale ? '#BAE6FD' : isMale ? '#93C5FD' : '#C7D2FE';
  const ringColor = isFemale ? '#38BDF8' : isMale ? '#3B82F6' : '#6366F1';
  const shirtColor = isFemale ? '#0EA5E9' : isMale ? '#2563EB' : '#4F46E5';

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Defs>
          <LinearGradient id="avatarBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={bgTop} />
            <Stop offset="1" stopColor={bgBottom} />
          </LinearGradient>
        </Defs>

        {/* Scalloped / flower-cloud backdrop when showBlob is enabled (hero header) */}
        {showBlob ? (
          <Path
            d="M60 6 C72 6 80 14 90 18 C102 22 112 32 112 45 C112 56 106 64 108 75 C110 88 100 102 87 106 C76 110 68 114 60 114 C52 114 44 110 33 106 C20 102 10 88 12 75 C14 64 8 56 8 45 C8 32 18 22 30 18 C40 14 48 6 60 6 Z"
            fill="url(#avatarBg)"
            stroke={ringColor}
            strokeWidth="2.5"
          />
        ) : (
          <Circle cx="60" cy="60" r="56" fill="url(#avatarBg)" stroke={ringColor} strokeWidth="3" />
        )}

        {/* Back hair layer for Female */}
        {isFemale && variant !== 2 && (
          <Path
            d="M28 54 C20 68 24 90 36 94 L84 94 C96 90 100 68 92 54 C88 34 76 24 60 24 C44 24 32 34 28 54 Z"
            fill="#1E293B"
          />
        )}

        {/* Top bun for Female variant 2 */}
        {isFemale && variant === 2 && (
          <Circle cx="60" cy="20" r="13" fill="#1E293B" />
        )}

        {/* Shoulders / Collar */}
        <Path
          d="M26 108 C28 88 42 82 60 82 C78 82 92 88 94 108 Z"
          fill={shirtColor}
        />
        {/* White medical/clean collar */}
        <Path
          d="M46 82 L60 95 L74 82 L68 80 L60 88 L52 80 Z"
          fill="#FFFFFF"
        />

        {/* Neck */}
        <Rect x="53" y="70" width="14" height="15" rx="6" fill="#FDBA8C" />

        {/* Ears */}
        <Circle cx="34" cy="58" r="7" fill="#FDBA8C" />
        <Circle cx="86" cy="58" r="7" fill="#FDBA8C" />

        {/* Head */}
        <Rect x="36" y="32" width="48" height="44" rx="22" fill="#FFD1B3" />

        {/* Soft rosy cheeks */}
        <Circle cx="45" cy="61" r="4.5" fill="#FDA4AF" opacity="0.55" />
        <Circle cx="75" cy="61" r="4.5" fill="#FDA4AF" opacity="0.55" />

        {/* Eyes */}
        <Circle cx="51" cy="54" r="3.4" fill="#0F172A" />
        <Circle cx="69" cy="54" r="3.4" fill="#0F172A" />
        <Circle cx="52.2" cy="52.8" r="1.1" fill="#FFFFFF" />
        <Circle cx="70.2" cy="52.8" r="1.1" fill="#FFFFFF" />

        {/* Friendly smile */}
        <Path
          d="M53 64 Q60 70 67 64"
          stroke="#0F172A"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />

        {/* Glasses option */}
        {hasGlasses && (
          <G stroke="#0284C7" strokeWidth="2.4" fill="none">
            <Circle cx="50" cy="54" r="7.5" fill="rgba(255,255,255,0.25)" />
            <Circle cx="70" cy="54" r="7.5" fill="rgba(255,255,255,0.25)" />
            <Path d="M57.5 54 L62.5 54" />
          </G>
        )}

        {/* Front Hair Styles */}
        {isFemale ? (
          <Path
            d="M34 50 C34 33 45 25 60 25 C75 25 86 33 86 50 C78 44 70 39 62 42 C52 45 43 44 34 50 Z"
            fill="#1E293B"
          />
        ) : isMale ? (
          variant === 2 ? (
            /* Curly top hair */
            <G fill="#1E293B">
              <Circle cx="44" cy="34" r="9" />
              <Circle cx="55" cy="30" r="10" />
              <Circle cx="67" cy="31" r="10" />
              <Circle cx="77" cy="35" r="8.5" />
            </G>
          ) : (
            /* Classic parted hair */
            <Path
              d="M35 48 C34 31 46 24 60 24 C75 24 86 31 85 48 C79 39 69 36 58 38 C48 40 41 42 35 48 Z"
              fill="#1E293B"
            />
          )
        ) : (
          /* Neutral modern wave */
          <Path
            d="M36 46 C36 31 47 25 60 25 C73 25 84 31 84 46 C75 39 62 38 36 46 Z"
            fill="#334155"
          />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F2FE',
    borderWidth: 3,
    borderColor: '#38BDF8',
    overflow: 'hidden',
  },
});
