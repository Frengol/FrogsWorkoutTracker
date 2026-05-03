import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { StyleSheet, Text, View } from 'react-native';

import { Card, PrimaryButton, SecondaryButton } from '@/src/shared/design/ui';
import { WorkoutMedia } from '@/src/shared/types/domain';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import { formatDuration } from '@/src/shared/utils/date';

const VideoMediaCard = ({
  media,
  onRemove,
}: {
  media: WorkoutMedia;
  onRemove?: (mediaId: string) => void;
}) => {
  const player = useVideoPlayer(media.localUri);

  return (
    <Card style={styles.mediaCard}>
      <VideoView player={player} style={styles.video} nativeControls surfaceType="textureView" />
      <Text style={styles.mediaTitle}>{media.fileName}</Text>
      <Text style={styles.mediaMeta}>
        vídeo {media.durationSeconds ? `· ${formatDuration(media.durationSeconds)}` : ''}
      </Text>
      {onRemove ? <SecondaryButton label="Remover" onPress={() => onRemove(media.id)} /> : null}
    </Card>
  );
};

export const WorkoutMediaGallery = ({
  media,
  onAddFromLibrary,
  onCapturePhoto,
  onRemove,
}: {
  media: WorkoutMedia[];
  onAddFromLibrary?: () => void;
  onCapturePhoto?: () => void;
  onRemove?: (mediaId: string) => void;
}) => (
  <View style={styles.gallery}>
    <View style={styles.actionsRow}>
      {onCapturePhoto ? <SecondaryButton label="Foto" onPress={onCapturePhoto} style={{ flex: 1 }} /> : null}
      {onAddFromLibrary ? <PrimaryButton label="Galeria" onPress={onAddFromLibrary} style={{ flex: 1 }} /> : null}
    </View>

    {media.length === 0 ? (
      <Card>
        <Text style={styles.emptyTitle}>Sem mídia anexada</Text>
        <Text style={styles.emptySubtitle}>Adicione foto ou vídeo do aparelho para registrar técnica, progresso ou contexto do treino.</Text>
      </Card>
    ) : (
      media.map((item) =>
        item.mediaType === 'video' ? (
          <VideoMediaCard key={item.id} media={item} onRemove={onRemove} />
        ) : (
          <Card key={item.id} style={styles.mediaCard}>
            <Image source={item.localUri} style={styles.image} contentFit="cover" />
            <Text style={styles.mediaTitle}>{item.fileName}</Text>
            <Text style={styles.mediaMeta}>foto local</Text>
            {onRemove ? <SecondaryButton label="Remover" onPress={() => onRemove(item.id)} /> : null}
          </Card>
        ),
      )
    )}
  </View>
);

const styles = StyleSheet.create({
  gallery: {
    gap: spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  mediaCard: {
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: radii.md,
    backgroundColor: colors.panel,
  },
  video: {
    width: '100%',
    height: 220,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.panel,
  },
  mediaTitle: {
    fontFamily: typography.bodySemi,
    fontSize: 14,
    color: colors.text,
  },
  mediaMeta: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  emptyTitle: {
    fontFamily: typography.heading,
    fontSize: 18,
    color: colors.text,
  },
  emptySubtitle: {
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
});
