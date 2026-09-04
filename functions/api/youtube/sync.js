/**
 * POST /api/youtube/sync  (Cloudflare Pages Function)
 * ---------------------------------------------------------------------------
 * Requires the creator's Supabase session. Refreshes the stored Google
 * access token if needed (using the stored refresh_token — never exposed
 * to the browser), fetches the creator's own recent videos from the
 * YouTube Data API, and returns them in the SAME raw shape the YouTube API
 * itself uses (an array of `videos` resources: { id, snippet, statistics }).
 *
 * This endpoint does NOT normalize the data — it hands back raw API
 * objects so the frontend can pass them through the existing
 * DraftzennNormalizedData.normalizeYouTubeRecord() (js/normalized-creator-
 * data.js), which stays the one and only YouTube normalization code path.
 *
 * Sync boundary: on a creator's first sync we pull their most recent 25
 * uploads. On every later sync we only ask YouTube for uploads published
 * after their `last_synced_at`, so re-syncing doesn't re-download their
 * whole history every time.
 *
 * Logic is unchanged from the original Vercel-style handler; only the
 * request/response and env-access plumbing were adapted for Cloudflare
 * Pages Functions.
 */

import { requireUser } from '../_lib/auth.js';
import { getAdminClient } from '../_lib/supabaseAdmin.js';
import { config } from '../_lib/config.js';
import { json } from '../_lib/http.js';

var MAX_VIDEOS_PER_SYNC = 25;

function toIntOrNull(v) {
  var n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function setStatus(admin, userId, status, error) {
  return admin.from('youtube_connections').update({ status: status, error: error }).eq('user_id', userId);
}

async function ytFetch(url, accessToken) {
  var r = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  var data = await r.json();
  if (!r.ok) {
    throw new Error('YouTube API error: ' + (data.error && data.error.message ? data.error.message : r.status));
  }
  return data;
}

/** Refreshes the access token if it's expired/near-expiry, and persists it. */
async function ensureFreshAccessToken(env, admin, userId, tokenRow) {
  var expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0;
  var stillValid = expiresAt - Date.now() > 60 * 1000; // 1 min buffer
  if (stillValid && tokenRow.access_token) return tokenRow.access_token;

  var refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID(env),
      client_secret: config.GOOGLE_CLIENT_SECRET(env),
      refresh_token: tokenRow.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  var refreshData = await refreshRes.json();
  if (!refreshRes.ok || !refreshData.access_token) {
    throw new Error('Couldn\u2019t refresh the YouTube access token \u2014 reconnect required.');
  }

  var newExpiresAt = new Date(Date.now() + (Number(refreshData.expires_in) || 3600) * 1000).toISOString();
  await admin.from('youtube_oauth_tokens').update({
    access_token: refreshData.access_token,
    expires_at: newExpiresAt,
    updated_at: new Date().toISOString()
  }).eq('user_id', userId);

  return refreshData.access_token;
}

export async function onRequestPost(context) {
  var request = context.request;
  var env = context.env;

  var user;
  try {
    user = await requireUser(request, env);
  } catch (err) {
    return json({ error: err.message }, err.statusCode || 401);
  }

  var admin = getAdminClient(env);

  var connectionResult = await admin
    .from('youtube_connections')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  var connection = connectionResult.data;

  if (!connection || connection.status === 'not_connected') {
    return json({ error: 'YouTube isn\u2019t connected yet.' }, 409);
  }

  var tokenRowResult = await admin
    .from('youtube_oauth_tokens')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  var tokenRow = tokenRowResult.data;

  if (!tokenRow || !tokenRow.refresh_token) {
    await setStatus(admin, user.id, 'error', 'Missing YouTube credentials \u2014 please reconnect.');
    return json({ error: 'Missing YouTube credentials \u2014 please reconnect.' }, 409);
  }

  await setStatus(admin, user.id, 'syncing', null);

  try {
    var accessToken = await ensureFreshAccessToken(env, admin, user.id, tokenRow);

    // Look up the channel's uploads playlist (one call, cheap) then page
    // through it newest-first, stopping once we hit already-synced videos
    // or MAX_VIDEOS_PER_SYNC, whichever comes first.
    var channelRes = await ytFetch(
      'https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics,snippet&mine=true',
      accessToken
    );
    var channel = channelRes.items && channelRes.items[0];
    if (!channel) {
      await setStatus(admin, user.id, 'error', 'YouTube channel is no longer accessible.');
      return json({ error: 'YouTube channel is no longer accessible.' }, 409);
    }

    var uploadsPlaylistId = channel.contentDetails &&
      channel.contentDetails.relatedPlaylists &&
      channel.contentDetails.relatedPlaylists.uploads;

    var lastSyncedAt = connection.last_synced_at ? new Date(connection.last_synced_at) : null;
    var videoIds = [];
    var pageToken = undefined;
    var stop = false;

    while (uploadsPlaylistId && !stop && videoIds.length < MAX_VIDEOS_PER_SYNC) {
      var playlistUrl = 'https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails,snippet' +
        '&maxResults=25&playlistId=' + encodeURIComponent(uploadsPlaylistId) +
        (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      var page = await ytFetch(playlistUrl, accessToken);

      (page.items || []).forEach(function (item) {
        if (videoIds.length >= MAX_VIDEOS_PER_SYNC) return;
        var publishedAt = item.contentDetails && item.contentDetails.videoPublishedAt;
        if (lastSyncedAt && publishedAt && new Date(publishedAt) <= lastSyncedAt) {
          stop = true; // caught up to last sync — incremental sync boundary
          return;
        }
        var vid = item.contentDetails && item.contentDetails.videoId;
        if (vid) videoIds.push(vid);
      });

      pageToken = page.nextPageToken;
      if (!pageToken) stop = true;
    }

    var videos = [];
    for (var i = 0; i < videoIds.length; i += 50) {
      var batch = videoIds.slice(i, i + 50);
      var videosRes = await ytFetch(
        'https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=' + batch.join(','),
        accessToken
      );
      videos = videos.concat(videosRes.items || []);
    }

    var stats = channel.statistics || {};
    var snippet = channel.snippet || {};
    var now = new Date().toISOString();

    await admin.from('youtube_connections').update({
      channel_name: snippet.title || connection.channel_name,
      subscriber_count: stats.hiddenSubscriberCount ? null : toIntOrNull(stats.subscriberCount),
      total_views: toIntOrNull(stats.viewCount),
      status: 'synced',
      last_synced_at: now,
      error: null
    }).eq('user_id', user.id);

    return json({
      channel: {
        channelId: channel.id,
        channelName: snippet.title || null,
        channelUrl: channel.id ? 'https://www.youtube.com/channel/' + channel.id : null,
        subscriberCount: stats.hiddenSubscriberCount ? null : toIntOrNull(stats.subscriberCount),
        totalViews: toIntOrNull(stats.viewCount)
      },
      videos: videos, // raw YouTube `videos` resources — frontend normalizes these
      syncedAt: now
    }, 200);
  } catch (err) {
    console.error('[youtube/sync] error:', err.message);
    await setStatus(admin, user.id, 'error', 'YouTube sync failed. Please try again.');
    return json({ error: 'YouTube sync failed. Please try again.' }, 502);
  }
}
