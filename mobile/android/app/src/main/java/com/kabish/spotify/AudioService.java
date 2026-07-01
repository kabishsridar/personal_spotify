package com.kabish.spotify;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import java.net.URL;

public class AudioService extends Service {
    public static final String ACTION_PLAY = "com.kabish.spotify.ACTION_PLAY";
    public static final String ACTION_PAUSE = "com.kabish.spotify.ACTION_PAUSE";
    public static final String ACTION_RESUME = "com.kabish.spotify.ACTION_RESUME";
    public static final String ACTION_SEEK = "com.kabish.spotify.ACTION_SEEK";
    public static final String ACTION_NEXT = "com.kabish.spotify.ACTION_NEXT";
    public static final String ACTION_PREV = "com.kabish.spotify.ACTION_PREV";
    public static final String ACTION_STOP = "com.kabish.spotify.ACTION_STOP";

    private static final String CHANNEL_ID = "spotify_playback_channel";
    private static final int NOTIFICATION_ID = 4545;

    public static MediaPlayer mediaPlayer;
    public static MediaSession mediaSession;
    public static boolean isPlaying = false;
    public static String currentTitle = "";
    public static String currentArtist = "";
    public static String currentArtUrl = "";
    public static Bitmap currentArtBitmap = null;
    public static int pendingSeekProgressMs = 0; // ⏱️ Holds seek position during asynchronous prepare phase
    
    public interface AudioEventListener {
        void onEvent(String eventName);
    }
    public static AudioEventListener eventListener;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        initSession();
    }

    private void initSession() {
        if (mediaSession == null) {
            mediaSession = new MediaSession(this, "SpotifyMediaSession");
            mediaSession.setActive(true);
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    resumePlayback();
                }

                @Override
                public void onPause() {
                    pausePlayback();
                }

                @Override
                public void onSkipToNext() {
                    triggerEvent("next");
                }

                @Override
                public void onSkipToPrevious() {
                    triggerEvent("prev");
                }
            });
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Spotify Background Controls",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows active persistent media playback controls matching Spotify.");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        String action = intent.getAction();

        if (ACTION_PLAY.equals(action)) {
            String url = intent.getStringExtra("url");
            String title = intent.getStringExtra("title");
            String artist = intent.getStringExtra("artist");
            String artUrl = intent.getStringExtra("artUrl");
            startPlayback(url, title, artist, artUrl);
        } else if (ACTION_PAUSE.equals(action)) {
            pausePlayback();
        } else if (ACTION_RESUME.equals(action)) {
            resumePlayback();
        } else if (ACTION_SEEK.equals(action)) {
            double seconds = intent.getDoubleExtra("seconds", 0.0);
            seekPlayback(seconds);
        } else if (ACTION_NEXT.equals(action)) {
            triggerEvent("next");
        } else if (ACTION_PREV.equals(action)) {
            triggerEvent("prev");
        } else if (ACTION_STOP.equals(action)) {
            stopPlaybackService();
        }

        return START_STICKY;
    }

    private void startPlayback(String url, String title, String artist, String artUrl) {
        currentTitle = title != null ? title : "Premium Stream";
        currentArtist = artist != null ? artist : "45 Personal Spotify";
        currentArtUrl = artUrl;
        currentArtBitmap = null;

        // Immediately start foreground mode to guarantee immediate service lifecycle whitelisting!
        showNotification(currentTitle, currentArtist, null);

        try {
            if (mediaPlayer != null) {
                try {
                    mediaPlayer.stop();
                    mediaPlayer.release();
                } catch(Exception e) {}
                mediaPlayer = null;
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            
            AudioAttributes attributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .build();
            mediaPlayer.setAudioAttributes(attributes);

            // Pass desktop browser User-Agent headers to completely bypass YouTube's 403 stream blockers!
            java.util.Map<String, String> headers = new java.util.HashMap<>();
            headers.put("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36");
            mediaPlayer.setDataSource(this, Uri.parse(url), headers);

            mediaPlayer.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                @Override
                public void onPrepared(MediaPlayer mp) {
                    mp.start();
                    if (pendingSeekProgressMs > 0) {
                        try {
                            mp.seekTo(pendingSeekProgressMs);
                        } catch(Exception e) {}
                        pendingSeekProgressMs = 0;
                    }
                    isPlaying = true;
                    updateSessionState(PlaybackState.STATE_PLAYING);
                    loadMetadataAndShowNotification(currentTitle, currentArtist, currentArtUrl);
                    triggerEvent("play");
                }
            });

            mediaPlayer.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer mp) {
                    isPlaying = false;
                    updateSessionState(PlaybackState.STATE_PAUSED);
                    triggerEvent("ended");
                }
            });

            mediaPlayer.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer mp, int what, int extra) {
                    isPlaying = false;
                    updateSessionState(PlaybackState.STATE_ERROR);
                    triggerEvent("error");
                    return true;
                }
            });

            mediaPlayer.prepareAsync();
            updateSessionState(PlaybackState.STATE_BUFFERING);
            showNotification(currentTitle, currentArtist, null);

        } catch (Exception e) {
            triggerEvent("error");
        }
    }

    private void pausePlayback() {
        if (mediaPlayer != null && isPlaying) {
            mediaPlayer.pause();
            isPlaying = false;
            updateSessionState(PlaybackState.STATE_PAUSED);
            showNotification(currentTitle, currentArtist, currentArtBitmap);
            triggerEvent("pause");
        }
    }

    private void resumePlayback() {
        if (mediaPlayer != null && !isPlaying) {
            mediaPlayer.start();
            isPlaying = true;
            updateSessionState(PlaybackState.STATE_PLAYING);
            showNotification(currentTitle, currentArtist, currentArtBitmap);
            triggerEvent("play");
        }
    }

    private void seekPlayback(double seconds) {
        int ms = (int) (seconds * 1000);
        if (mediaPlayer != null) {
            try {
                mediaPlayer.seekTo(ms);
            } catch (Exception e) {
                pendingSeekProgressMs = ms;
            }
        } else {
            pendingSeekProgressMs = ms;
        }
    }

    private void loadMetadataAndShowNotification(final String title, final String artist, final String artUrl) {
        final MediaMetadata.Builder metadataBuilder = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist);

        if (artUrl != null && !artUrl.isEmpty()) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        java.net.URL url = new java.net.URL(artUrl);
                        Bitmap bitmap = BitmapFactory.decodeStream(url.openConnection().getInputStream());
                        if (bitmap != null) {
                            currentArtBitmap = bitmap;
                            metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, bitmap);
                            metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, bitmap);
                            mediaSession.setMetadata(metadataBuilder.build());
                            showNotification(title, artist, bitmap);
                        } else {
                            mediaSession.setMetadata(metadataBuilder.build());
                            showNotification(title, artist, null);
                        }
                    } catch (Exception e) {
                        mediaSession.setMetadata(metadataBuilder.build());
                        showNotification(title, artist, null);
                    }
                }
            }).start();
        } else {
            mediaSession.setMetadata(metadataBuilder.build());
            showNotification(title, artist, null);
        }
    }

    private void showNotification(String title, String artist, Bitmap artwork) {
        // Pending Intents for Media buttons
        Intent prevIntent = new Intent(this, AudioService.class).setAction(ACTION_PREV);
        PendingIntent pPrev = PendingIntent.getService(this, 1, prevIntent, PendingIntent.FLAG_IMMUTABLE);

        Intent playIntent = new Intent(this, AudioService.class).setAction(isPlaying ? ACTION_PAUSE : ACTION_RESUME);
        PendingIntent pPlay = PendingIntent.getService(this, 2, playIntent, PendingIntent.FLAG_IMMUTABLE);

        Intent nextIntent = new Intent(this, AudioService.class).setAction(ACTION_NEXT);
        PendingIntent pNext = PendingIntent.getService(this, 3, nextIntent, PendingIntent.FLAG_IMMUTABLE);

        Intent stopIntent = new Intent(this, AudioService.class).setAction(ACTION_STOP);
        PendingIntent pStop = PendingIntent.getService(this, 4, stopIntent, PendingIntent.FLAG_IMMUTABLE);

        // Click on notification to launch MainActivity
        Intent contentIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pContent = PendingIntent.getActivity(this, 0, contentIntent, PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(pContent)
            .setOngoing(isPlaying)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setVisibility(Notification.VISIBILITY_PUBLIC);

        if (artwork != null) {
            builder.setLargeIcon(artwork);
        }

        // Add standard media actions
        builder.addAction(new Notification.Action.Builder(
            android.R.drawable.ic_media_previous, "Previous", pPrev).build());
            
        builder.addAction(new Notification.Action.Builder(
            isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, 
            isPlaying ? "Pause" : "Play", pPlay).build());

        builder.addAction(new Notification.Action.Builder(
            android.R.drawable.ic_media_next, "Next", pNext).build());

        builder.addAction(new Notification.Action.Builder(
            android.R.drawable.ic_menu_close_clear_cancel, "Close", pStop).build());

        // Standard dynamic MediaStyle
        Notification.MediaStyle style = new Notification.MediaStyle()
            .setMediaSession(mediaSession.getSessionToken())
            .setShowActionsInCompactView(0, 1, 2);
        builder.setStyle(style);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, builder.build(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, builder.build());
        }
    }

    private void updateSessionState(int state) {
        if (mediaSession == null) return;
        PlaybackState.Builder stateBuilder = new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | 
                        PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
            .setState(state, mediaPlayer != null ? mediaPlayer.getCurrentPosition() : 0, 1.0f);
        mediaSession.setPlaybackState(stateBuilder.build());
    }

    private void stopPlaybackService() {
        isPlaying = false;
        if (mediaPlayer != null) {
            try {
                mediaPlayer.stop();
                mediaPlayer.release();
            } catch(Exception e) {}
            mediaPlayer = null;
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
        }
        triggerEvent("pause");
        stopForeground(true);
        stopSelf();
    }

    private void triggerEvent(String eventName) {
        if (eventListener != null) {
            eventListener.onEvent(eventName);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        // stopPlaybackService(); - Modified to prevent stopping the service when the app goes to background
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        // Keep service running for background playback
        // stopPlaybackService(); - Commented out to keep service alive
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
