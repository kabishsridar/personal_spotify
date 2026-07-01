package com.kabish.spotify;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeAudioPlayer")
public class NativeAudioPlayerPlugin extends Plugin {

    @Override
    public void load() {
        super.load();
        
        // Listen to events from AudioService (lockscreen, headset buttons, completion)
        AudioService.eventListener = new AudioService.AudioEventListener() {
            @Override
            public void onEvent(String eventName) {
                JSObject data = new JSObject();
                data.put("event", eventName);
                notifyListeners("audioEvent", data);
            }
        };
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "Premium Stream");
        String artist = call.getString("artist", "45 Personal Spotify");
        String artUrl = call.getString("artUrl", "");

        try {
            Intent intent = new Intent(getContext(), AudioService.class);
            intent.setAction(AudioService.ACTION_PLAY);
            intent.putExtra("url", url);
            intent.putExtra("title", title);
            intent.putExtra("artist", artist);
            intent.putExtra("artUrl", artUrl);

            // Handle Foreground Service start requirements for modern SDKs
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }

            JSObject ret = new JSObject();
            ret.put("status", "buffering");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to trigger background AudioService: " + e.getMessage());
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), AudioService.class);
            intent.setAction(AudioService.ACTION_PAUSE);
            getContext().startService(intent);
            if (call != null) call.resolve();
        } catch(Exception e) {
            if (call != null) call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void resume(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), AudioService.class);
            intent.setAction(AudioService.ACTION_RESUME);
            getContext().startService(intent);
            if (call != null) call.resolve();
        } catch(Exception e) {
            if (call != null) call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void seek(PluginCall call) {
        try {
            double seconds = call.getDouble("seconds", 0.0);
            Intent intent = new Intent(getContext(), AudioService.class);
            intent.setAction(AudioService.ACTION_SEEK);
            intent.putExtra("seconds", seconds);
            getContext().startService(intent);
            if (call != null) call.resolve();
        } catch(Exception e) {
            if (call != null) call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void getProgress(PluginCall call) {
        JSObject ret = new JSObject();
        if (AudioService.mediaPlayer != null) {
            try {
                ret.put("currentTime", AudioService.mediaPlayer.getCurrentPosition() / 1000.0);
                ret.put("duration", AudioService.mediaPlayer.getDuration() / 1000.0);
                ret.put("isPlaying", AudioService.isPlaying);
            } catch(Exception e) {
                ret.put("currentTime", 0.0);
                ret.put("duration", 0.0);
                ret.put("isPlaying", false);
            }
        } else {
            ret.put("currentTime", 0.0);
            ret.put("duration", 0.0);
            ret.put("isPlaying", false);
        }
        call.resolve(ret);
    }
}
