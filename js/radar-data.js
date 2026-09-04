/**
 * Draftzenn — Creator Radar data module
 * ---------------------------------------------------------------------------
 * DEMO / PLACEHOLDER DATA ONLY.
 *
 * This file is the ONLY place opportunity data lives. It is intentionally
 * kept separate from js/creator-radar.js (the rendering/filtering/matching
 * logic) so that a real trend-detection backend can replace everything below
 * later without touching the UI:
 *
 *   1. Fetch real opportunities from your API.
 *   2. Shape each one to match the Opportunity contract below.
 *   3. Set `window.DraftzennRadarData.opportunities` (or replace this whole
 *      file with one that fetches async and calls
 *      `DraftzennRadar.setOpportunities(list)` — see creator-radar.js).
 *
 * No changes needed in dashboard.html or creator-radar.js.
 *
 * IMPORTANT: `platform`, `niche`, and `contentType` below intentionally use
 * the exact same values as the Creator Profile fields (see
 * sql/creator_profiles.sql and onboarding.html) so that Creator Radar can
 * match opportunities to a creator's saved profile:
 *   platform:    'YouTube' | 'Instagram' | 'TikTok' | 'Other'
 *   niche:       'Gaming' | 'Tech' | 'Education' | 'Fitness' |
 *                'Entertainment' | 'Finance' | 'Lifestyle' | 'Other'
 *   contentType: 'Shorts/Reels' | 'Long-form' | 'Both' | 'Other'
 *
 * Opportunity contract:
 *   {
 *     id: string,
 *     topic: string,              // the content opportunity / video idea
 *     platform: string,           // must appear in `platforms` below
 *     niche: string,               // must appear in `niches` below
 *     contentType: string,        // must appear in `contentTypes` below
 *     opportunityScore: number,   // 0-100
 *     trendStrength: 'Early' | 'Building' | 'Strong' | 'Very strong',
 *     competition: 'Low' | 'Medium' | 'High',
 *     audienceFit: 'Early' | 'Moderate' | 'Strong',  // how well this fits the
 *                                 // niche's existing audience appetite
 *     status: 'Emerging' | 'Rising' | 'Hot',
 *     whyItMatters: string,       // why this is worth a creator's attention
 *     suggestedAction: string,    // the concrete next move
 *     recommended: boolean        // fallback "for you" flag, used only when
 *                                 // no creator profile is available yet
 *   }
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var platforms = ['YouTube', 'Instagram', 'TikTok', 'Other'];
  var niches = ['Gaming', 'Tech', 'Education', 'Fitness', 'Entertainment', 'Finance', 'Lifestyle', 'Other'];
  var contentTypes = ['Shorts/Reels', 'Long-form', 'Both', 'Other'];
  var statuses = ['Emerging', 'Rising', 'Hot'];

  var opportunities = [
    // ---- Gaming --------------------------------------------------------
    {
      id: 'op_gaming_youtube',
      topic: 'Boss-fight breakdowns for underrated indie games',
      platform: 'YouTube',
      niche: 'Gaming',
      contentType: 'Long-form',
      opportunityScore: 85,
      trendStrength: 'Strong',
      competition: 'Low',
      audienceFit: 'Strong',
      status: 'Hot',
      whyItMatters: 'Deep-dive breakdowns of tough fights in smaller indie titles are getting picked up by search long after release, with almost no big channels covering them.',
      suggestedAction: 'Pick one indie boss fight your audience has asked about and film a full breakdown of the pattern and the strategy that beats it.',
      recommended: true
    },
    {
      id: 'op_gaming_instagram',
      topic: '60-second speedrun trick reels',
      platform: 'Instagram',
      niche: 'Gaming',
      contentType: 'Shorts/Reels',
      opportunityScore: 74,
      trendStrength: 'Building',
      competition: 'Medium',
      audienceFit: 'Moderate',
      status: 'Rising',
      whyItMatters: 'Bite-sized "one trick, one clip" speedrun reels are outperforming full run uploads for reach, since they work even for viewers who don\u2019t follow the game.',
      suggestedAction: 'Clip your single best time-saving trick from a recent run and caption it with the exact frame it happens on.',
      recommended: false
    },
    {
      id: 'op_gaming_tiktok',
      topic: '"This game is more fun broke" budget series',
      platform: 'TikTok',
      niche: 'Gaming',
      contentType: 'Shorts/Reels',
      opportunityScore: 69,
      trendStrength: 'Early',
      competition: 'Low',
      audienceFit: 'Moderate',
      status: 'Emerging',
      whyItMatters: 'A small cluster of creators are intentionally playing with self-imposed budget/gear restrictions. Format is still forming and easy to make your own.',
      suggestedAction: 'Set one silly restriction for your next session (no upgrades, starter gear only) and narrate why it\u2019s actually more fun.',
      recommended: false
    },

    // ---- Tech ------------------------------------------------------------
    {
      id: 'op_tech_youtube',
      topic: 'Real-world battery life tests vs. manufacturer claims',
      platform: 'YouTube',
      niche: 'Tech',
      contentType: 'Long-form',
      opportunityScore: 82,
      trendStrength: 'Strong',
      competition: 'Medium',
      audienceFit: 'Strong',
      status: 'Hot',
      whyItMatters: 'Viewers no longer trust spec-sheet battery numbers. Creators running their own multi-day tests are seeing much higher completion rates than standard review formats.',
      suggestedAction: 'Run a simple, repeatable battery test on a device you already own and show the raw numbers on screen, not just a verdict.',
      recommended: true
    },
    {
      id: 'op_tech_instagram',
      topic: 'Gadget unboxings with one honest flaw called out',
      platform: 'Instagram',
      niche: 'Tech',
      contentType: 'Shorts/Reels',
      opportunityScore: 71,
      trendStrength: 'Building',
      competition: 'Medium',
      audienceFit: 'Moderate',
      status: 'Rising',
      whyItMatters: 'Purely positive unboxings are getting scrolled past. Reels that name one genuine downside up front are earning noticeably more saves and comments.',
      suggestedAction: 'Film your next unboxing normally, but script one specific flaw into the first 5 seconds instead of the last.',
      recommended: false
    },
    {
      id: 'op_tech_tiktok',
      topic: '60-second app comparisons',
      platform: 'TikTok',
      niche: 'Tech',
      contentType: 'Shorts/Reels',
      opportunityScore: 78,
      trendStrength: 'Strong',
      competition: 'Medium',
      audienceFit: 'Strong',
      status: 'Rising',
      whyItMatters: 'Quick side-by-side app comparisons are outperforming long-form reviews, with strong watch-through when the hook lands in the first 2 seconds.',
      suggestedAction: 'Pick two competing apps your audience already asks about and script a tight 3-beat comparison: cost, speed, dealbreaker.',
      recommended: false
    },

    // ---- Education ---------------------------------------------------------
    {
      id: 'op_education_youtube',
      topic: '"Explain it like I\u2019m actually confused" deep dives',
      platform: 'YouTube',
      niche: 'Education',
      contentType: 'Long-form',
      opportunityScore: 80,
      trendStrength: 'Strong',
      competition: 'Low',
      audienceFit: 'Strong',
      status: 'Hot',
      whyItMatters: 'Most explainer content assumes too much prior knowledge. Videos that openly start from genuine confusion are getting unusually high watch time from beginners.',
      suggestedAction: 'Pick a concept you personally had to re-learn, and film the explanation you wish you\u2019d gotten the first time.',
      recommended: true
    },
    {
      id: 'op_education_instagram',
      topic: 'Study method carousels with a real before/after',
      platform: 'Instagram',
      niche: 'Education',
      contentType: 'Shorts/Reels',
      opportunityScore: 66,
      trendStrength: 'Building',
      competition: 'Medium',
      audienceFit: 'Moderate',
      status: 'Rising',
      whyItMatters: 'Carousels showing an actual grade or retention improvement, not just a technique, are being saved and shared well above the niche average.',
      suggestedAction: 'Pick one study method you\u2019ve used and build a 4-slide carousel around a specific, honest before/after result.',
      recommended: false
    },
    {
      id: 'op_education_tiktok',
      topic: 'One-concept-per-video micro lessons',
      platform: 'TikTok',
      niche: 'Education',
      contentType: 'Shorts/Reels',
      opportunityScore: 72,
      trendStrength: 'Strong',
      competition: 'Medium',
      audienceFit: 'Moderate',
      status: 'Rising',
      whyItMatters: 'Tightly scoped, single-concept lessons under 30 seconds are getting rewatched and saved as quick references far more than broader topic overviews.',
      suggestedAction: 'Take one idea you\u2019d normally cover in a longer video and cut it down to the smallest teachable unit.',
      recommended: false
    },

    // ---- Fitness -----------------------------------------------------------
    {
      id: 'op_fitness_youtube',
      topic: 'Unfiltered "what I eat in a day" videos',
      platform: 'YouTube',
      niche: 'Fitness',
      contentType: 'Long-form',
      opportunityScore: 76,
      trendStrength: 'Strong',
      competition: 'Medium',
      audienceFit: 'Moderate',
      status: 'Rising',
      whyItMatters: 'Viewers are fatigued by overly polished, aspirational eating content. Realistic, occasionally messy versions are earning more trust and comments.',
      suggestedAction: 'Film a normal, unstyled day of eating and narrate the reasoning behind choices instead of just showing the food.',
      recommended: true
    },
    {
      id: 'op_fitness_instagram',
      topic: '10-minute no-equipment routines',
      platform: 'Instagram',
      niche: 'Fitness',
      contentType: 'Shorts/Reels',
      opportunityScore: 79,
      trendStrength: 'Strong',
      competition: 'High',
      audienceFit: 'Moderate',
      status: 'Rising',
      whyItMatters: 'Demand for short, equipment-free routines stays consistently high, though the format is crowded. Clear on-screen form cues stand out and get saved more.',
      suggestedAction: 'Film a 10-minute routine using only bodyweight, with a text overlay reminder on the one form cue people get wrong.',
      recommended: false
    },
    {
      id: 'op_fitness_tiktok',
      topic: 'Form-check duets correcting common mistakes',
      platform: 'TikTok',
      niche: 'Fitness',
      contentType: 'Shorts/Reels',
      opportunityScore: 70,
      trendStrength: 'Building',
      competition: 'Medium',
      audienceFit: 'Moderate',
      status: 'Rising',
      whyItMatters: 'Duet-style form corrections are getting strong engagement because they feel personal and actionable rather than generic advice.',
      suggestedAction: 'Duet a common "form check please" clip in your niche and walk through the one fix that matters most.',
      recommended: false
    },

    // ---- Entertainment -------------------------------------------------
    {
      id: 'op_entertainment_youtube',
      topic: 'Reaction breakdowns for underrated indie films',
      platform: 'YouTube',
      niche: 'Entertainment',
      contentType: 'Long-form',
      opportunityScore: 73,
      trendStrength: 'Building',
      competition: 'Low',
      audienceFit: 'Moderate',
      status: 'Rising',
      whyItMatters: 'Coverage of smaller, overlooked films is thin, leaving room to become a go-to source before a title finds a wider audience.',
      suggestedAction: 'Pick one recent indie release you genuinely enjoyed and record a reaction-plus-breakdown rather than a straight review.',
      recommended: true
    },
    {
      id: 'op_entertainment_instagram',
      topic: 'Behind-the-scenes carousel breakdowns',
      platform: 'Instagram',
      niche: 'Entertainment',
      contentType: 'Shorts/Reels',
      opportunityScore: 64,
      trendStrength: 'Early',
      competition: 'Low',
      audienceFit: 'Moderate',
      status: 'Emerging',
      whyItMatters: 'Carousels that explain how a scene or effect was actually made are getting outsized saves relative to their view counts.',
      suggestedAction: 'Pick one moment from something you cover often and build a carousel around the "how it was actually done" detail.',
      recommended: false
    },
    {
      id: 'op_entertainment_tiktok',
      topic: 'Plot-twist reaction clips',
      platform: 'TikTok',
      niche: 'Entertainment',
      contentType: 'Shorts/Reels',
      opportunityScore: 68,
      trendStrength: 'Building',
      competition: 'Medium',
      audienceFit: 'Moderate',
      status: 'Rising',
      whyItMatters: 'Short, spoiler-flagged reaction clips to well-known twists are consistently getting high completion rates as low-effort, high-payoff watches.',
      suggestedAction: 'Record a genuine first-reaction clip to a twist you haven\u2019t covered yet, clearly labelled with a spoiler warning up front.',
      recommended: false
    },

    // ---- Finance -------------------------------------------------------
    {
      id: 'op_finance_youtube',
      topic: '"Cost of the aesthetic" breakdowns',
      platform: 'YouTube',
      niche: 'Finance',
      contentType: 'Long-form',
      opportunityScore: 84,
      trendStrength: 'Strong',
      competition: 'Low',
      audienceFit: 'Strong',
      status: 'Hot',
      whyItMatters: 'Viewers are actively asking what popular lifestyle setups actually cost. Creators who show real numbers are getting outsized engagement versus vague "worth it?" videos.',
      suggestedAction: 'Pick one aesthetic trending in your niche and build a video entirely around a real, itemized cost breakdown.',
      recommended: true
    },
    {
      id: 'op_finance_instagram',
      topic: 'Subscription audit challenges',
      platform: 'Instagram',
      niche: 'Finance',
      contentType: 'Shorts/Reels',
      opportunityScore: 58,
      trendStrength: 'Early',
      competition: 'Low',
      audienceFit: 'Early',
      status: 'Emerging',
      whyItMatters: 'A small but growing cluster of creators are filming themselves cancelling unused subscriptions live. Early signal, low competition, format not yet standardized.',
      suggestedAction: 'Do a quick "audit my subscriptions with me" reel before the format gets crowded.',
      recommended: false
    },
    {
      id: 'op_finance_tiktok',
      topic: '"One number" budgeting method',
      platform: 'TikTok',
      niche: 'Finance',
      contentType: 'Shorts/Reels',
      opportunityScore: 71,
      trendStrength: 'Building',
      competition: 'Medium',
      audienceFit: 'Moderate',
      status: 'Rising',
      whyItMatters: 'Simplified, single-metric budgeting explainers are consistently out-completing multi-step budgeting content in watch time.',
      suggestedAction: 'Reduce your usual budgeting advice to one number viewers can track, and build a 30-second explainer around it.',
      recommended: false
    },

    // ---- Lifestyle -----------------------------------------------------
    {
      id: 'op_lifestyle_youtube',
      topic: '"Reset the room" 10-minute resets',
      platform: 'YouTube',
      niche: 'Lifestyle',
      contentType: 'Long-form',
      opportunityScore: 62,
      trendStrength: 'Building',
      competition: 'Medium',
      audienceFit: 'Early',
      status: 'Emerging',
      whyItMatters: 'Short, timed tidy-up videos are gaining a steady audience among viewers who want a quick reset rather than a full organization overhaul.',
      suggestedAction: 'Time yourself resetting one real (not styled) room in 10 minutes, and keep the edit close to real time.',
      recommended: false
    },
    {
      id: 'op_lifestyle_instagram',
      topic: 'Small-space storage hacks that aren\u2019t ads',
      platform: 'Instagram',
      niche: 'Lifestyle',
      contentType: 'Shorts/Reels',
      opportunityScore: 76,
      trendStrength: 'Strong',
      competition: 'High',
      audienceFit: 'Moderate',
      status: 'Rising',
      whyItMatters: 'Demand is high, but the format is saturated with sponsored product placements. Genuinely useful, non-sponsored hacks stand out and get saved more.',
      suggestedAction: 'Film a hack using something viewers already own, and say plainly up front that nothing in it is sponsored.',
      recommended: true
    },
    {
      id: 'op_lifestyle_tiktok',
      topic: '"Declutter with me" narrated series',
      platform: 'TikTok',
      niche: 'Lifestyle',
      contentType: 'Shorts/Reels',
      opportunityScore: 55,
      trendStrength: 'Early',
      competition: 'Low',
      audienceFit: 'Early',
      status: 'Emerging',
      whyItMatters: 'A narrated, decision-by-decision declutter format is emerging as an alternative to fast-cut before/after clips. Still small, low competition.',
      suggestedAction: 'Narrate your reasoning out loud while decluttering one drawer or shelf, keeping cuts minimal.',
      recommended: false
    },

    // ---- Other -----------------------------------------------------------
    {
      id: 'op_other_youtube',
      topic: 'Niche-crossover collab explainers',
      platform: 'YouTube',
      niche: 'Other',
      contentType: 'Long-form',
      opportunityScore: 60,
      trendStrength: 'Building',
      competition: 'Low',
      audienceFit: 'Moderate',
      status: 'Emerging',
      whyItMatters: 'Creators pairing two unrelated niches in one video are picking up cross-audience discovery that single-topic content doesn\u2019t get.',
      suggestedAction: 'Find one creator outside your usual niche whose audience would genuinely enjoy your angle, and pitch a joint explainer.',
      recommended: false
    },
    {
      id: 'op_other_instagram',
      topic: 'Day-in-the-life carousels for unconventional work',
      platform: 'Instagram',
      niche: 'Other',
      contentType: 'Shorts/Reels',
      opportunityScore: 63,
      trendStrength: 'Building',
      competition: 'Low',
      audienceFit: 'Moderate',
      status: 'Rising',
      whyItMatters: 'Audiences are curious about jobs and routines that don\u2019t fit a standard category, and there\u2019s little competition covering the specifics.',
      suggestedAction: 'Document one full day exactly as it happens and let the unusual details carry the carousel.',
      recommended: false
    },
    {
      id: 'op_other_tiktok',
      topic: 'Rapid-fire Q&A format',
      platform: 'TikTok',
      niche: 'Other',
      contentType: 'Shorts/Reels',
      opportunityScore: 57,
      trendStrength: 'Early',
      competition: 'Low',
      audienceFit: 'Early',
      status: 'Emerging',
      whyItMatters: 'Fast, unedited Q&A clips are an easy way to surface what an audience actually wants to know before committing to a full video.',
      suggestedAction: 'Pull five questions you get asked often and answer each in under 10 seconds, back to back.',
      recommended: false
    }
  ];

  var weeklyDeltas = {
    opportunitiesFound: '+5 this week',
    avgScore: '+6 pts',
    nichesWatched: 'Steady',
    platformsCovered: 'Steady'
  };

  global.DraftzennRadarData = {
    isDemoData: true,
    platforms: platforms,
    niches: niches,
    contentTypes: contentTypes,
    statuses: statuses,
    opportunities: opportunities,
    weeklyDeltas: weeklyDeltas
  };
})(window);
